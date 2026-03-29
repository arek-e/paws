import { describe, expect, test } from 'vitest';

import { CostSummarySchema, DaemonCostSchema, FleetOverviewSchema } from './fleet.js';

describe('FleetOverviewSchema', () => {
  test('accepts valid overview', () => {
    const result = FleetOverviewSchema.parse({
      totalWorkers: 3,
      healthyWorkers: 3,
      totalCapacity: 15,
      usedCapacity: 7,
      queuedSessions: 2,
      activeDaemons: 4,
      activeSessions: 7,
    });
    expect(result.totalWorkers).toBe(3);
    expect(result.activeSessions).toBe(7);
  });

  test('accepts all zeros', () => {
    const result = FleetOverviewSchema.parse({
      totalWorkers: 0,
      healthyWorkers: 0,
      totalCapacity: 0,
      usedCapacity: 0,
      queuedSessions: 0,
      activeDaemons: 0,
      activeSessions: 0,
    });
    expect(result.totalWorkers).toBe(0);
  });

  test('rejects negative values', () => {
    expect(() =>
      FleetOverviewSchema.parse({
        totalWorkers: -1,
        healthyWorkers: 0,
        totalCapacity: 0,
        usedCapacity: 0,
        queuedSessions: 0,
        activeDaemons: 0,
        activeSessions: 0,
      }),
    ).toThrow();
  });

  test('rejects missing fields', () => {
    expect(() => FleetOverviewSchema.parse({ totalWorkers: 3 })).toThrow();
  });
});

describe('DaemonCostSchema', () => {
  test('accepts valid daemon cost', () => {
    const result = DaemonCostSchema.parse({
      role: 'pr-reviewer',
      totalInvocations: 42,
      totalVcpuSeconds: 2520,
      totalDurationMs: 1_260_000,
    });
    expect(result.role).toBe('pr-reviewer');
    expect(result.totalVcpuSeconds).toBe(2520);
  });

  test('accepts zeros', () => {
    const result = DaemonCostSchema.parse({
      role: 'idle-daemon',
      totalInvocations: 0,
      totalVcpuSeconds: 0,
      totalDurationMs: 0,
    });
    expect(result.totalInvocations).toBe(0);
  });

  test('rejects negative vcpuSeconds', () => {
    expect(() =>
      DaemonCostSchema.parse({
        role: 'bad',
        totalInvocations: 0,
        totalVcpuSeconds: -1,
        totalDurationMs: 0,
      }),
    ).toThrow();
  });
});

describe('CostSummarySchema', () => {
  test('accepts valid cost summary', () => {
    const result = CostSummarySchema.parse({
      totalVcpuSeconds: 5040,
      totalSessions: 84,
      byDaemon: [
        {
          role: 'pr-reviewer',
          totalInvocations: 42,
          totalVcpuSeconds: 2520,
          totalDurationMs: 1_260_000,
        },
        {
          role: 'deployer',
          totalInvocations: 42,
          totalVcpuSeconds: 2520,
          totalDurationMs: 1_260_000,
        },
      ],
    });
    expect(result.byDaemon).toHaveLength(2);
    expect(result.totalVcpuSeconds).toBe(5040);
  });

  test('accepts empty byDaemon', () => {
    const result = CostSummarySchema.parse({
      totalVcpuSeconds: 0,
      totalSessions: 0,
      byDaemon: [],
    });
    expect(result.byDaemon).toHaveLength(0);
  });
});
