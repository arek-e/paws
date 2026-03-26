import { describe, expect, test } from 'vitest';

import { FleetOverviewSchema } from './fleet.js';

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
