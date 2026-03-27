import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';

import { createStaticDiscovery } from './static.js';

// Minimal fake worker server
function makeWorkerServer(opts: {
  status: string;
  worker: string;
  uptime: number;
  maxConcurrent: number;
  running: number;
  queued: number;
  available: number;
}) {
  return createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: opts.status,
          worker: opts.worker,
          uptime: opts.uptime,
          capacity: {
            maxConcurrent: opts.maxConcurrent,
            running: opts.running,
            queued: opts.queued,
            available: opts.available,
          },
        }),
      );
    } else {
      res.writeHead(404);
      res.end();
    }
  });
}

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

describe('createStaticDiscovery', () => {
  test('returns empty array when no URLs provided', async () => {
    const discovery = createStaticDiscovery([]);
    const workers = await discovery.getWorkers();
    expect(workers).toEqual([]);
  });

  test('returns empty array when all workers are unreachable', async () => {
    const discovery = createStaticDiscovery(['http://127.0.0.1:1', 'http://127.0.0.1:2']);
    const workers = await discovery.getWorkers();
    expect(workers).toEqual([]);
  });

  describe('with a live worker server', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
      server = makeWorkerServer({
        status: 'healthy',
        worker: 'my-worker',
        uptime: 5000,
        maxConcurrent: 5,
        running: 2,
        queued: 0,
        available: 3,
      });
      baseUrl = await listen(server);
    });

    afterAll(() => server.close());

    test('returns a healthy worker with correct fields', async () => {
      const discovery = createStaticDiscovery([baseUrl]);
      const workers = await discovery.getWorkers();

      expect(workers).toHaveLength(1);
      const w = workers[0]!;
      expect(w.name).toBe(baseUrl); // name is the base URL for reconnection
      expect(w.status).toBe('healthy');
      expect(w.capacity.maxConcurrent).toBe(5);
      expect(w.capacity.running).toBe(2);
      expect(w.capacity.queued).toBe(0);
      expect(w.capacity.available).toBe(3);
      expect(w.uptime).toBe(5000);
    });

    test('normalizes "ok" status to "healthy"', async () => {
      const s = makeWorkerServer({
        status: 'ok',
        worker: 'w2',
        uptime: 1,
        maxConcurrent: 3,
        running: 0,
        queued: 0,
        available: 3,
      });
      const url = await listen(s);
      const discovery = createStaticDiscovery([url]);
      const workers = await discovery.getWorkers();
      expect(workers[0]!.status).toBe('healthy');
      s.close();
    });

    test('returns only reachable workers when some fail', async () => {
      const discovery = createStaticDiscovery([baseUrl, 'http://127.0.0.1:1']);
      const workers = await discovery.getWorkers();
      expect(workers).toHaveLength(1);
      expect(workers[0]!.name).toBe(baseUrl);
    });

    test('aggregates multiple healthy workers', async () => {
      const s2 = makeWorkerServer({
        status: 'healthy',
        worker: 'w2',
        uptime: 2000,
        maxConcurrent: 3,
        running: 1,
        queued: 0,
        available: 2,
      });
      const url2 = await listen(s2);

      const discovery = createStaticDiscovery([baseUrl, url2]);
      const workers = await discovery.getWorkers();
      expect(workers).toHaveLength(2);
      s2.close();
    });
  });
});
