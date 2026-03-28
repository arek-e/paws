import { describe, expect, it } from 'vitest';

import { createWorkerRegistry } from './registry.js';

describe('createWorkerRegistry', () => {
  const health = {
    status: 'healthy' as const,
    capacity: { maxConcurrent: 5, running: 1, queued: 0, available: 4 },
    snapshot: { id: 'agent-latest', version: 1, ageMs: 0 },
    uptime: 10000,
  };

  it('registers and retrieves a worker', () => {
    const reg = createWorkerRegistry();
    reg.register('w1', 'http://10.0.0.1:3000', health);

    expect(reg.count()).toBe(1);
    const w = reg.get('w1');
    expect(w?.name).toBe('w1');
    expect(w?.url).toBe('http://10.0.0.1:3000');
    expect(w?.status).toBe('healthy');
  });

  it('unregisters a worker', () => {
    const reg = createWorkerRegistry();
    reg.register('w1', 'http://10.0.0.1:3000', health);
    reg.unregister('w1');

    expect(reg.count()).toBe(0);
    expect(reg.get('w1')).toBeUndefined();
  });

  it('updates on heartbeat', () => {
    const reg = createWorkerRegistry();
    reg.register('w1', 'http://10.0.0.1:3000', health);
    reg.heartbeat('w1', {
      status: 'degraded',
      capacity: { maxConcurrent: 5, running: 4, queued: 1, available: 0 },
    });

    const w = reg.get('w1');
    expect(w?.status).toBe('degraded');
    expect(w?.capacity.running).toBe(4);
  });

  it('getWorkers returns workers with fresh heartbeats', async () => {
    const reg = createWorkerRegistry();
    reg.register('w1', 'http://10.0.0.1:3000', health);

    const workers = await reg.getWorkers();
    expect(workers).toHaveLength(1);
    expect(workers[0]!.name).toBe('http://10.0.0.1:3000');
    expect(workers[0]!.status).toBe('healthy');
  });

  it('getWorkers skips workers with stale heartbeats', async () => {
    const reg = createWorkerRegistry();
    reg.register('w1', 'http://10.0.0.1:3000', health);

    // Manually set lastHeartbeat to 60s ago
    const w = reg.get('w1')!;
    w.lastHeartbeat = new Date(Date.now() - 60_000).toISOString();

    const workers = await reg.getWorkers();
    expect(workers).toHaveLength(0);
  });

  it('getAll returns all workers regardless of staleness', () => {
    const reg = createWorkerRegistry();
    reg.register('w1', 'http://10.0.0.1:3000', health);
    reg.register('w2', 'http://10.0.0.2:3000', health);

    expect(reg.getAll()).toHaveLength(2);
  });

  it('ignores heartbeat for unknown worker', () => {
    const reg = createWorkerRegistry();
    reg.heartbeat('nonexistent', { status: 'healthy' });
    expect(reg.count()).toBe(0);
  });
});
