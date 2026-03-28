import { okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAutoscaler, type AutoscalerConfig } from './autoscaler.js';
import { createWorkerRegistry } from './discovery/registry.js';

function mockProvider() {
  return {
    name: 'mock-cloud',
    createHost: vi.fn().mockReturnValue(
      okAsync({
        id: 'host-1',
        name: 'worker-1',
        provider: 'mock-cloud',
        status: 'provisioning' as const,
        ipv4: '10.0.0.1',
        ipv6: null,
        region: 'us-1',
        plan: 'small',
        createdAt: new Date(),
        metadata: {},
      }),
    ),
    getHost: vi.fn().mockReturnValue(okAsync({ id: 'host-1', status: 'ready' })),
    listHosts: vi.fn().mockReturnValue(okAsync([])),
    deleteHost: vi.fn().mockReturnValue(okAsync(undefined)),
  };
}

const workerHealth = {
  status: 'healthy' as const,
  capacity: { maxConcurrent: 5, running: 0, queued: 0, available: 5 },
  snapshot: { id: 'default', version: 1, ageMs: 0 },
  uptime: 1000,
};

function createConfig(overrides?: Partial<AutoscalerConfig>): AutoscalerConfig {
  return {
    provider: mockProvider(),
    registry: createWorkerRegistry(),
    minWorkers: 1,
    maxWorkers: 5,
    scaleUpThreshold: 0.8,
    scaleDownThreshold: 0.2,
    scaleDownDelayMs: 0, // instant for tests
    cooldownMs: 0, // instant for tests
    pollIntervalMs: 100,
    workerPlan: 'small',
    workerRegion: 'us-1',
    gatewayUrl: 'https://test.example.com',
    apiKey: 'test-key',
    ...overrides,
  };
}

describe('createAutoscaler', () => {
  it('returns status', () => {
    const config = createConfig();
    const scaler = createAutoscaler(config);
    const status = scaler.status();

    expect(status.enabled).toBe(true);
    expect(status.provider).toBe('mock-cloud');
    expect(status.minWorkers).toBe(1);
    expect(status.maxWorkers).toBe(5);
    expect(status.currentWorkers).toBe(0);
    expect(status.utilization).toBe(0);
    expect(status.lastScaleEvent).toBeNull();
  });

  it('starts and stops without error', () => {
    const config = createConfig();
    const scaler = createAutoscaler(config);
    scaler.start();
    scaler.stop();
  });

  it('scales up when sessions are queued', async () => {
    const provider = mockProvider();
    const registry = createWorkerRegistry();
    registry.register('w1', 'http://10.0.0.1:3000', {
      ...workerHealth,
      capacity: { maxConcurrent: 5, running: 5, queued: 2, available: 0 },
    });

    const config = createConfig({ provider, registry });
    const scaler = createAutoscaler(config);

    // Manually trigger evaluation by starting + waiting
    scaler.start();
    await new Promise((r) => setTimeout(r, 200));
    scaler.stop();

    expect(provider.createHost).toHaveBeenCalled();
    expect(scaler.status().lastScaleEvent?.type).toBe('up');
    expect(scaler.status().lastScaleEvent?.reason).toContain('queued');
  });

  it('scales up when utilization exceeds threshold', async () => {
    const provider = mockProvider();
    const registry = createWorkerRegistry();
    registry.register('w1', 'http://10.0.0.1:3000', {
      ...workerHealth,
      capacity: { maxConcurrent: 5, running: 5, queued: 0, available: 0 },
    });

    const config = createConfig({ provider, registry });
    const scaler = createAutoscaler(config);

    scaler.start();
    await new Promise((r) => setTimeout(r, 200));
    scaler.stop();

    expect(provider.createHost).toHaveBeenCalled();
    expect(scaler.status().lastScaleEvent?.reason).toContain('utilization');
  });

  it('does not scale up when under threshold', async () => {
    const provider = mockProvider();
    const registry = createWorkerRegistry();
    registry.register('w1', 'http://10.0.0.1:3000', {
      ...workerHealth,
      capacity: { maxConcurrent: 5, running: 2, queued: 0, available: 3 },
    });

    const config = createConfig({ provider, registry });
    const scaler = createAutoscaler(config);

    scaler.start();
    await new Promise((r) => setTimeout(r, 200));
    scaler.stop();

    expect(provider.createHost).not.toHaveBeenCalled();
  });

  it('does not exceed max workers', async () => {
    const provider = mockProvider();
    const registry = createWorkerRegistry();
    // Register 5 workers (= max)
    for (let i = 0; i < 5; i++) {
      registry.register(`w${i}`, `http://10.0.0.${i}:3000`, {
        ...workerHealth,
        capacity: { maxConcurrent: 5, running: 5, queued: 1, available: 0 },
      });
    }

    const config = createConfig({ provider, registry, maxWorkers: 5 });
    const scaler = createAutoscaler(config);

    scaler.start();
    await new Promise((r) => setTimeout(r, 200));
    scaler.stop();

    expect(provider.createHost).not.toHaveBeenCalled();
  });

  it('scales down when utilization is low', async () => {
    const provider = mockProvider();
    provider.listHosts.mockReturnValue(
      okAsync([
        { id: 'host-1', name: 'w1', ipv4: '10.0.0.1', status: 'ready' },
        { id: 'host-2', name: 'w2', ipv4: '10.0.0.2', status: 'ready' },
      ]),
    );
    const registry = createWorkerRegistry();
    registry.register('w1', 'http://10.0.0.1:3000', {
      ...workerHealth,
      capacity: { maxConcurrent: 5, running: 0, queued: 0, available: 5 },
    });
    registry.register('w2', 'http://10.0.0.2:3000', {
      ...workerHealth,
      capacity: { maxConcurrent: 5, running: 0, queued: 0, available: 5 },
    });

    const config = createConfig({
      provider,
      registry,
      minWorkers: 1,
      scaleDownDelayMs: 0,
      pollIntervalMs: 50,
    });
    const scaler = createAutoscaler(config);

    scaler.start();
    // Need at least 2 poll cycles: first sets lowUtilSince, second triggers scale-down
    await new Promise((r) => setTimeout(r, 300));
    scaler.stop();

    expect(provider.deleteHost).toHaveBeenCalled();
    expect(scaler.status().lastScaleEvent?.type).toBe('down');
  });

  it('respects cooldown between scale events', async () => {
    const provider = mockProvider();
    const registry = createWorkerRegistry();
    registry.register('w1', 'http://10.0.0.1:3000', {
      ...workerHealth,
      capacity: { maxConcurrent: 5, running: 5, queued: 3, available: 0 },
    });

    const config = createConfig({ provider, registry, cooldownMs: 60_000 });
    const scaler = createAutoscaler(config);

    scaler.start();
    await new Promise((r) => setTimeout(r, 300));
    scaler.stop();

    // Should only scale once despite multiple evaluations (cooldown)
    expect(provider.createHost).toHaveBeenCalledTimes(1);
  });
});
