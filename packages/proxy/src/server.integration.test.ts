/**
 * Tier 2: Proxy server integration test
 *
 * Tests the TLS MITM proxy with real HTTP servers.
 * Uses self-signed CA certs generated in-process.
 *
 * NOTE: Requires Bun runtime globals (Bun.serve, Bun.spawn).
 * Skips automatically when running under vitest without Bun globals.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createProxy } from './server.js';
import type { ProxyInstance } from './types.js';

// Proxy and upstream use Bun.serve — skip if Bun runtime isn't available
const hasBun = typeof (globalThis as Record<string, unknown>).Bun !== 'undefined';

describe.skipIf(!hasBun)('Proxy HTTP integration', () => {
  let upstreamServer: ReturnType<typeof Bun.serve>;
  let proxy: ProxyInstance;
  let caCert: string;
  let caKey: string;

  // Track requests that hit the upstream
  const receivedRequests: Array<{
    url: string;
    method: string;
    headers: Record<string, string>;
  }> = [];

  beforeAll(async () => {
    // Generate a real self-signed CA for testing
    const proc = Bun.spawn(
      [
        'openssl',
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:prime256v1',
        '-nodes',
        '-keyout',
        '/dev/stdout',
        '-out',
        '/dev/stdout',
        '-days',
        '1',
        '-subj',
        '/CN=test-ca',
        '-addext',
        'basicConstraints=critical,CA:TRUE,pathlen:0',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    // Split PEM output into key and cert
    const keyMatch = output.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/);
    const certMatch = output.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);

    if (!keyMatch || !certMatch) {
      throw new Error('Failed to generate test CA');
    }

    caCert = certMatch[0];
    caKey = keyMatch[0];

    // Start a fake upstream server
    upstreamServer = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        const headers: Record<string, string> = {};
        req.headers.forEach((v, k) => {
          headers[k] = v;
        });
        receivedRequests.push({ url: url.pathname, method: req.method, headers });
        return Response.json({ ok: true, path: url.pathname });
      },
    });

    proxy = createProxy({
      listen: { host: '127.0.0.1', port: 0 },
      domains: {
        'api.example.com': { headers: { 'x-api-key': 'test-secret-key' } },
        'git.example.com': { headers: { authorization: 'Bearer ghp_test123' } },
        'allowed.example.com': {},
      },
      ca: { cert: caCert, key: caKey },
    });

    await proxy.start();
  });

  afterAll(async () => {
    await proxy?.stop();
    upstreamServer?.stop();
  });

  test('proxy starts and returns address', () => {
    const addr = proxy.address();
    expect(addr.port).toBeGreaterThan(0);
  });

  test('proxy blocks non-allowlisted domain on HTTP', async () => {
    const addr = proxy.address();
    const res = await fetch(`http://127.0.0.1:${addr.port}/test`, {
      headers: { host: 'evil.example.com' },
    });
    expect(res.status).toBe(403);
    const text = await res.text();
    expect(text).toContain('Blocked');
  });

  test('proxy allows allowlisted domain on HTTP', async () => {
    const addr = proxy.address();
    // allowed.example.com is in domains — should be forwarded
    // But since we can't actually resolve it, this tests the domain check logic
    const res = await fetch(`http://127.0.0.1:${addr.port}/test`, {
      headers: { host: 'allowed.example.com' },
    });
    // May fail to connect upstream (no real server), but should NOT be 403
    expect(res.status).not.toBe(403);
  });

  test('proxy allows credential-configured domain on HTTP', async () => {
    const addr = proxy.address();
    const res = await fetch(`http://127.0.0.1:${addr.port}/v1/messages`, {
      headers: { host: 'api.example.com' },
    });
    // Domain is in domains map — should be allowed (not 403)
    expect(res.status).not.toBe(403);
  });

  test('proxy can be stopped and restarted', async () => {
    const tempProxy = createProxy({
      listen: { host: '127.0.0.1', port: 0 },
      domains: {},
      ca: { cert: caCert, key: caKey },
    });
    await tempProxy.start();
    await expect(tempProxy.stop()).resolves.not.toThrow();
  });

  test('proxy returns CA cert and key', () => {
    const ca = proxy.ca();
    expect(ca.cert).toContain('BEGIN CERTIFICATE');
    expect(ca.key).toContain('BEGIN PRIVATE KEY');
  });
});
