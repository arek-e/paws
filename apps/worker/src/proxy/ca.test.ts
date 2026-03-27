import { describe, expect, test, vi } from 'vitest';

import type { ExecFn } from '@paws/firecracker';

import { generateSessionCa } from './ca.js';

/**
 * Mock Bun.file() since vitest runs in Node mode.
 * The generateSessionCa function reads cert/key files via Bun.file().text()
 */
vi.stubGlobal('Bun', {
  file: (path: string) => ({
    text: async () => (path.endsWith('.crt') ? 'MOCK-CERT-PEM' : 'MOCK-KEY-PEM'),
  }),
});

function createMockExec(): ExecFn & { calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const exec = (async (cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    return { stdout: '', stderr: '' };
  }) as ExecFn & { calls: Array<{ cmd: string; args: string[] }> };
  exec.calls = calls;
  return exec;
}

describe('generateSessionCa', () => {
  test('creates directory before generating key', async () => {
    const exec = createMockExec();
    const result = await generateSessionCa({ dir: '/tmp/test-ca', exec });
    expect(result.isOk()).toBe(true);
    expect(exec.calls[0]).toEqual({ cmd: 'mkdir', args: ['-p', '/tmp/test-ca'] });
  });

  test('generates ECDSA P-256 key with openssl', async () => {
    const exec = createMockExec();
    await generateSessionCa({ dir: '/tmp/test-ca', exec });

    const keyGenCall = exec.calls[1];
    expect(keyGenCall?.cmd).toBe('openssl');
    expect(keyGenCall?.args).toContain('ecparam');
    expect(keyGenCall?.args).toContain('prime256v1');
    expect(keyGenCall?.args).toContain('-genkey');
    expect(keyGenCall?.args).toContain('/tmp/test-ca/ca.key');
  });

  test('generates self-signed CA certificate with correct subject', async () => {
    const exec = createMockExec();
    await generateSessionCa({ dir: '/tmp/test-ca', exec });

    const certCall = exec.calls[2];
    expect(certCall?.cmd).toBe('openssl');
    expect(certCall?.args).toContain('req');
    expect(certCall?.args).toContain('-x509');
    expect(certCall?.args).toContain('/CN=paws-session-ca');
    expect(certCall?.args).toContain('/tmp/test-ca/ca.key');
    expect(certCall?.args).toContain('/tmp/test-ca/ca.crt');
  });

  test('uses default 24h validity (1 day)', async () => {
    const exec = createMockExec();
    await generateSessionCa({ dir: '/tmp/test-ca', exec });

    const certCall = exec.calls[2];
    const daysIdx = certCall?.args.indexOf('-days');
    expect(daysIdx).toBeGreaterThan(-1);
    expect(certCall?.args[daysIdx! + 1]).toBe('1');
  });

  test('calculates validity days from custom hours', async () => {
    const exec = createMockExec();
    await generateSessionCa({ dir: '/tmp/test-ca', validityHours: 72, exec });

    const certCall = exec.calls[2];
    const daysIdx = certCall?.args.indexOf('-days');
    expect(certCall?.args[daysIdx! + 1]).toBe('3');
  });

  test('rounds up partial days', async () => {
    const exec = createMockExec();
    // 25 hours should round up to 2 days
    await generateSessionCa({ dir: '/tmp/test-ca', validityHours: 25, exec });

    const certCall = exec.calls[2];
    const daysIdx = certCall?.args.indexOf('-days');
    expect(certCall?.args[daysIdx! + 1]).toBe('2');
  });

  test('returns cert and key content with paths', async () => {
    const exec = createMockExec();
    const result = await generateSessionCa({ dir: '/tmp/test-ca', exec });
    expect(result.isOk()).toBe(true);

    const ca = result._unsafeUnwrap();
    expect(ca.cert).toBe('MOCK-CERT-PEM');
    expect(ca.key).toBe('MOCK-KEY-PEM');
    expect(ca.certPath).toBe('/tmp/test-ca/ca.crt');
    expect(ca.keyPath).toBe('/tmp/test-ca/ca.key');
  });

  test('returns WorkerError on exec failure', async () => {
    const exec: ExecFn = async () => {
      throw new Error('openssl not found');
    };

    const result = await generateSessionCa({ dir: '/tmp/test-ca', exec });
    expect(result.isErr()).toBe(true);

    const err = result._unsafeUnwrapErr();
    expect(err.code).toBe('PROXY_FAILED');
    expect(err.message).toContain('Failed to generate session CA');
    expect(err.message).toContain('openssl not found');
  });

  test('includes CA constraint extensions', async () => {
    const exec = createMockExec();
    await generateSessionCa({ dir: '/tmp/test-ca', exec });

    const certCall = exec.calls[2];
    expect(certCall?.args).toContain('basicConstraints=critical,CA:TRUE,pathlen:0');
    expect(certCall?.args).toContain('keyUsage=critical,keyCertSign,cRLSign');
  });
});
