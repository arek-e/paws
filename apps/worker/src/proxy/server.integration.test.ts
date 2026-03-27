/**
 * Tier 2: Proxy server integration test
 *
 * Tests the TLS MITM proxy with real HTTP servers.
 * Uses self-signed CA certs generated in-process.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { NetworkConfig } from '@paws/types';

import { createProxy, type ProxyHandle } from './server.js';
import type { SessionCa } from './ca.js';

let upstreamServer: ReturnType<typeof Bun.serve>;
let proxy: ProxyHandle;
let ca: SessionCa;

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

  ca = {
    key: keyMatch[0],
    cert: certMatch[0],
    keyPath: '/tmp/test-ca.key',
    certPath: '/tmp/test-ca.crt',
  };

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

  const network: NetworkConfig = {
    allowOut: ['allowed.example.com'],
    credentials: {
      'api.example.com': { headers: { 'x-api-key': 'test-secret-key' } },
      'git.example.com': { headers: { authorization: 'Bearer ghp_test123' } },
    },
  };

  proxy = createProxy({
    listenHost: '127.0.0.1',
    httpPort: 0,
    httpsPort: 0,
    network,
    ca,
  });
});

afterAll(() => {
  proxy?.stop();
  upstreamServer?.stop();
});

describe('Proxy HTTP integration', () => {
  test('proxy starts and returns ports', () => {
    expect(proxy.httpPort).toBeGreaterThan(0);
    expect(proxy.httpsPort).toBeGreaterThan(0);
  });

  test('proxy blocks non-allowlisted domain on HTTP', async () => {
    const res = await fetch(`http://127.0.0.1:${proxy.httpPort}/test`, {
      headers: { host: 'evil.example.com' },
    });
    expect(res.status).toBe(403);
    const text = await res.text();
    expect(text).toContain('Blocked');
  });

  test('proxy allows allowlisted domain on HTTP', async () => {
    // allowed.example.com is in allowOut — should be forwarded
    // But since we can't actually resolve it, this tests the domain check logic
    // In real usage, iptables DNAT handles routing
    const res = await fetch(`http://127.0.0.1:${proxy.httpPort}/test`, {
      headers: { host: 'allowed.example.com' },
    });
    // May fail to connect upstream (no real server), but should NOT be 403
    // The proxy will attempt to forward — failure is a network error, not a block
    expect(res.status).not.toBe(403);
  });

  test('proxy allows credential-configured domain on HTTP', async () => {
    const res = await fetch(`http://127.0.0.1:${proxy.httpPort}/v1/messages`, {
      headers: { host: 'api.example.com' },
    });
    // Domain is in credentials map — should be allowed (not 403)
    expect(res.status).not.toBe(403);
  });

  test('proxy can be stopped', () => {
    // This just verifies stop() doesn't throw
    const tempProxy = createProxy({
      listenHost: '127.0.0.1',
      httpPort: 0,
      httpsPort: 0,
      network: { allowOut: [], credentials: {} },
      ca,
    });
    expect(() => tempProxy.stop()).not.toThrow();
  });
});
