import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createServer, type Server } from 'node:http';

import { createPangolinClient } from './pangolin-client.js';

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (typeof addr === 'object' && addr) {
        resolve(`http://127.0.0.1:${addr.port}`);
      }
    });
  });
}

describe('createPangolinClient', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('createSite returns site ID and secret', async () => {
    const server = createServer((req, res) => {
      if (req.method === 'POST' && req.url?.includes('/sites')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            data: { siteId: 'site-123', secret: 'sec-abc', name: 'my-worker' },
          }),
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    const url = await listen(server);

    const client = createPangolinClient({
      apiUrl: `${url}/api/v1`,
      apiKey: 'test-key',
      orgId: 'test-org',
    });

    const result = await client.createSite('my-worker');
    expect(result.siteId).toBe('site-123');
    expect(result.secret).toBe('sec-abc');
    expect(result.name).toBe('my-worker');

    server.close();
  });

  test('createSite throws on API error', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(500);
      res.end('Internal Server Error');
    });
    const url = await listen(server);

    const client = createPangolinClient({
      apiUrl: `${url}/api/v1`,
      apiKey: 'test-key',
      orgId: 'test-org',
    });

    await expect(client.createSite('worker')).rejects.toThrow('Pangolin API error 500');

    server.close();
  });

  test('deleteSite succeeds on 200', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200);
      res.end();
    });
    const url = await listen(server);

    const client = createPangolinClient({
      apiUrl: `${url}/api/v1`,
      apiKey: 'test-key',
      orgId: 'test-org',
    });

    await expect(client.deleteSite('site-123')).resolves.toBeUndefined();

    server.close();
  });
});
