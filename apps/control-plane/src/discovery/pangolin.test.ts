import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createServer, type Server } from 'node:http';

import { createPangolinDiscovery } from './pangolin.js';

// --- Fake Pangolin API server ---

interface FakeSite {
  siteId: string;
  name: string;
  online: boolean;
  subnet: string;
}

function makePangolinApi(opts: { sites: FakeSite[]; statusCode?: number; malformed?: boolean }) {
  return createServer((req, res) => {
    if (req.url?.startsWith('/api/v1/org/') && req.method === 'GET') {
      res.writeHead(opts.statusCode ?? 200, { 'Content-Type': 'application/json' });
      if (opts.malformed) {
        res.end('not json{{{');
        return;
      }
      res.end(JSON.stringify({ data: { sites: opts.sites } }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
}

// --- Fake Worker health server ---

function makeWorkerServer(opts: { status?: string } = {}) {
  return createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: opts.status ?? 'healthy',
          worker: 'test-worker',
          uptime: 5000,
          capacity: { maxConcurrent: 5, running: 1, queued: 0, available: 4 },
        }),
      );
    } else {
      res.writeHead(404);
      res.end();
    }
  });
}

function listen(server: Server): Promise<{ url: string; port: number }> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (typeof addr === 'object' && addr) {
        resolve({ url: `http://127.0.0.1:${addr.port}`, port: addr.port });
      }
    });
  });
}

describe('createPangolinDiscovery', () => {
  let stdoutLines: string[];
  // Suppress structured logger output in tests (writes to process.stdout)
  beforeEach(() => {
    stdoutLines = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      if (typeof chunk === 'string') stdoutLines.push(chunk);
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('discovers healthy workers from Pangolin API', async () => {
    // Worker server on a known port — Pangolin reports this as the tunnel IP
    const workerServer = makeWorkerServer();
    const { port: workerPort } = await listen(workerServer);

    const pangolinApi = makePangolinApi({
      sites: [{ siteId: 'site-1', name: 'worker-1', online: true, subnet: `127.0.0.1/32` }],
    });
    const { url: apiUrl } = await listen(pangolinApi);

    const discovery = createPangolinDiscovery({
      apiUrl: `${apiUrl}/api/v1`,
      apiKey: 'test-key',
      orgId: 'test-org',
      workerPort,
      pollIntervalMs: 100_000, // don't auto-poll during test
    });

    // Wait for initial poll (CI can be slow)
    let workers: Awaited<ReturnType<typeof discovery.getWorkers>> = [];
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      workers = await discovery.getWorkers();
      if (workers.length > 0) break;
    }
    expect(workers).toHaveLength(1);
    expect(workers[0]!.name).toBe(`http://127.0.0.1:${workerPort}`);
    expect(workers[0]!.status).toBe('healthy');
    expect(workers[0]!.capacity.available).toBe(4);

    workerServer.close();
    pangolinApi.close();
  });

  test('returns empty array when no sites are online', async () => {
    const pangolinApi = makePangolinApi({
      sites: [{ siteId: 'site-1', name: 'worker-1', online: false, subnet: '100.89.1.1/32' }],
    });
    const { url: apiUrl } = await listen(pangolinApi);

    const discovery = createPangolinDiscovery({
      apiUrl: `${apiUrl}/api/v1`,
      apiKey: 'test-key',
      orgId: 'test-org',
      pollIntervalMs: 100_000,
    });

    await new Promise((r) => setTimeout(r, 100));

    const workers = await discovery.getWorkers();
    expect(workers).toEqual([]);

    pangolinApi.close();
  });

  test('returns empty array when API returns empty sites', async () => {
    const pangolinApi = makePangolinApi({ sites: [] });
    const { url: apiUrl } = await listen(pangolinApi);

    const discovery = createPangolinDiscovery({
      apiUrl: `${apiUrl}/api/v1`,
      apiKey: 'test-key',
      orgId: 'test-org',
      pollIntervalMs: 100_000,
    });

    await new Promise((r) => setTimeout(r, 100));

    const workers = await discovery.getWorkers();
    expect(workers).toEqual([]);

    pangolinApi.close();
  });

  test('skips sites with missing subnet', async () => {
    const pangolinApi = makePangolinApi({
      sites: [{ siteId: 'site-1', name: 'worker-1', online: true, subnet: '' }],
    });
    const { url: apiUrl } = await listen(pangolinApi);

    const discovery = createPangolinDiscovery({
      apiUrl: `${apiUrl}/api/v1`,
      apiKey: 'test-key',
      orgId: 'test-org',
      pollIntervalMs: 100_000,
    });

    await new Promise((r) => setTimeout(r, 100));

    const workers = await discovery.getWorkers();
    expect(workers).toEqual([]);

    pangolinApi.close();
  });

  test('keeps cached state on 401 and logs specific error', async () => {
    const pangolinApi = makePangolinApi({ sites: [], statusCode: 401 });
    const { url: apiUrl } = await listen(pangolinApi);

    const discovery = createPangolinDiscovery({
      apiUrl: `${apiUrl}/api/v1`,
      apiKey: 'bad-key',
      orgId: 'test-org',
      pollIntervalMs: 100_000,
    });

    await new Promise((r) => setTimeout(r, 100));

    const workers = await discovery.getWorkers();
    expect(workers).toEqual([]); // empty cache initially

    expect(stdoutLines.some((l) => l.includes('PANGOLIN_API_KEY'))).toBe(true);

    pangolinApi.close();
  });

  test('keeps cached state on 500', async () => {
    const pangolinApi = makePangolinApi({ sites: [], statusCode: 500 });
    const { url: apiUrl } = await listen(pangolinApi);

    const discovery = createPangolinDiscovery({
      apiUrl: `${apiUrl}/api/v1`,
      apiKey: 'test-key',
      orgId: 'test-org',
      pollIntervalMs: 100_000,
    });

    await new Promise((r) => setTimeout(r, 100));

    const workers = await discovery.getWorkers();
    expect(workers).toEqual([]);

    expect(stdoutLines.some((l) => l.includes('500'))).toBe(true);

    pangolinApi.close();
  });

  test('keeps cached state on malformed JSON', async () => {
    const pangolinApi = makePangolinApi({ sites: [], malformed: true });
    const { url: apiUrl } = await listen(pangolinApi);

    const discovery = createPangolinDiscovery({
      apiUrl: `${apiUrl}/api/v1`,
      apiKey: 'test-key',
      orgId: 'test-org',
      pollIntervalMs: 100_000,
    });

    await new Promise((r) => setTimeout(r, 100));

    const workers = await discovery.getWorkers();
    expect(workers).toEqual([]);

    expect(stdoutLines.some((l) => l.includes('malformed JSON'))).toBe(true);

    pangolinApi.close();
  });

  test('skips workers that fail health check', async () => {
    // No worker server running → health check will fail
    const pangolinApi = makePangolinApi({
      sites: [{ siteId: 'site-1', name: 'worker-1', online: true, subnet: '127.0.0.1/32' }],
    });
    const { url: apiUrl } = await listen(pangolinApi);

    const discovery = createPangolinDiscovery({
      apiUrl: `${apiUrl}/api/v1`,
      apiKey: 'test-key',
      orgId: 'test-org',
      workerPort: 1, // unreachable port
      pollIntervalMs: 100_000,
    });

    await new Promise((r) => setTimeout(r, 200));

    const workers = await discovery.getWorkers();
    expect(workers).toEqual([]);

    pangolinApi.close();
  });

  test('worker.name is the full URL for dispatch compatibility', async () => {
    const workerServer = makeWorkerServer();
    const { port: workerPort } = await listen(workerServer);

    const pangolinApi = makePangolinApi({
      sites: [{ siteId: 'site-1', name: 'my-worker', online: true, subnet: '127.0.0.1/32' }],
    });
    const { url: apiUrl } = await listen(pangolinApi);

    const discovery = createPangolinDiscovery({
      apiUrl: `${apiUrl}/api/v1`,
      apiKey: 'test-key',
      orgId: 'test-org',
      workerPort,
      pollIntervalMs: 100_000,
    });

    await new Promise((r) => setTimeout(r, 100));

    const workers = await discovery.getWorkers();
    expect(workers[0]!.name).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    // name is NOT the human-readable "my-worker" label
    expect(workers[0]!.name).not.toBe('my-worker');

    workerServer.close();
    pangolinApi.close();
  });

  test('filters out unhealthy workers from getWorkers()', async () => {
    const workerServer = makeWorkerServer({ status: 'unhealthy' });
    const { port: workerPort } = await listen(workerServer);

    const pangolinApi = makePangolinApi({
      sites: [{ siteId: 'site-1', name: 'worker-1', online: true, subnet: '127.0.0.1/32' }],
    });
    const { url: apiUrl } = await listen(pangolinApi);

    const discovery = createPangolinDiscovery({
      apiUrl: `${apiUrl}/api/v1`,
      apiKey: 'test-key',
      orgId: 'test-org',
      workerPort,
      pollIntervalMs: 100_000,
    });

    await new Promise((r) => setTimeout(r, 100));

    const workers = await discovery.getWorkers();
    expect(workers).toEqual([]);

    workerServer.close();
    pangolinApi.close();
  });
});
