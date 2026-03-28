import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';

import { createWorkerClient } from './worker-client.js';

let server: Server;
let baseUrl: string;

// Fake worker server using Node http (vitest runs in Node mode)
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url!, `http://localhost`);

    if (url.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          worker: 'test-worker',
          uptime: 1234,
          capacity: { maxConcurrent: 5, running: 2, queued: 0, available: 3 },
        }),
      );
      return;
    }

    if (url.pathname === '/v1/sessions' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const parsed = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sessionId: parsed.sessionId, status: 'queued' }));
      });
      return;
    }

    if (url.pathname.startsWith('/v1/sessions/') && req.method === 'GET') {
      const id = url.pathname.split('/').pop();
      if (id === 'not-found') {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          sessionId: id,
          status: 'completed',
          exitCode: 0,
          stdout: 'hello',
          durationMs: 5000,
        }),
      );
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (typeof addr === 'object' && addr) {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

describe('createWorkerClient', () => {
  test('health returns worker status', async () => {
    const client = createWorkerClient(baseUrl);
    const health = await client.health();

    expect(health.status).toBe('ok');
    expect(health.worker).toBe('test-worker');
    expect(health.uptime).toBe(1234);
    expect(health.capacity.maxConcurrent).toBe(5);
    expect(health.capacity.running).toBe(2);
    expect(health.capacity.available).toBe(3);
  });

  test('createSession dispatches session to worker', async () => {
    const client = createWorkerClient(baseUrl);
    const result = await client.createSession('sess-123', {
      snapshot: 'test-snapshot',
      workload: { type: 'script', script: 'echo hi', env: {} },
      timeoutMs: 600_000,
    });

    expect(result.sessionId).toBe('sess-123');
    expect(result.status).toBe('queued');
  });

  test('getSession returns session result', async () => {
    const client = createWorkerClient(baseUrl);
    const result = await client.getSession('sess-456');

    expect(result).toBeDefined();
    expect(result?.sessionId).toBe('sess-456');
    expect(result?.status).toBe('completed');
    expect(result?.exitCode).toBe(0);
    expect(result?.stdout).toBe('hello');
  });

  test('getSession returns undefined for 404', async () => {
    const client = createWorkerClient(baseUrl);
    const result = await client.getSession('not-found');

    expect(result).toBeUndefined();
  });
});
