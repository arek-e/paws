import { describe, expect, test } from 'vitest';

import {
  WorkerCapacitySchema,
  WorkerListResponseSchema,
  WorkerSchema,
  WorkerSnapshotInfoSchema,
  WorkerStatus,
} from './worker.js';

describe('WorkerStatus', () => {
  test('accepts valid statuses', () => {
    for (const s of ['healthy', 'degraded', 'unhealthy'] as const) {
      expect(WorkerStatus.parse(s)).toBe(s);
    }
  });

  test('rejects invalid status', () => {
    expect(() => WorkerStatus.parse('offline')).toThrow();
  });
});

describe('WorkerCapacitySchema', () => {
  test('accepts valid capacity', () => {
    const result = WorkerCapacitySchema.parse({
      maxConcurrent: 5,
      running: 3,
      queued: 1,
      available: 2,
    });
    expect(result.maxConcurrent).toBe(5);
  });

  test('rejects negative running', () => {
    expect(() =>
      WorkerCapacitySchema.parse({
        maxConcurrent: 5,
        running: -1,
        queued: 0,
        available: 5,
      }),
    ).toThrow();
  });
});

describe('WorkerSnapshotInfoSchema', () => {
  test('accepts valid snapshot info', () => {
    const result = WorkerSnapshotInfoSchema.parse({
      id: 'claude-agent',
      version: 3,
      ageMs: 86400000,
    });
    expect(result.id).toBe('claude-agent');
  });

  test('rejects version 0', () => {
    expect(() => WorkerSnapshotInfoSchema.parse({ id: 'test', version: 0, ageMs: 0 })).toThrow();
  });
});

describe('WorkerSchema', () => {
  test('accepts valid worker', () => {
    const result = WorkerSchema.parse({
      name: 'worker-node-1',
      status: 'healthy',
      capacity: { maxConcurrent: 5, running: 3, queued: 1, available: 2 },
      snapshot: { id: 'claude-agent', version: 3, ageMs: 86400000 },
      uptime: 604800,
    });
    expect(result.name).toBe('worker-node-1');
  });
});

describe('WorkerListResponseSchema', () => {
  test('accepts valid list', () => {
    const result = WorkerListResponseSchema.parse({
      workers: [
        {
          name: 'worker-1',
          status: 'healthy',
          capacity: { maxConcurrent: 5, running: 0, queued: 0, available: 5 },
          snapshot: { id: 'test', version: 1, ageMs: 0 },
          uptime: 0,
        },
      ],
    });
    expect(result.workers).toHaveLength(1);
  });

  test('accepts empty list', () => {
    const result = WorkerListResponseSchema.parse({ workers: [] });
    expect(result.workers).toEqual([]);
  });
});
