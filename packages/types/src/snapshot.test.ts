import { describe, expect, test } from 'vitest';

import {
  SnapshotBuildRequestSchema,
  SnapshotBuildResponseSchema,
  SnapshotBuildStatus,
  SnapshotListResponseSchema,
  SnapshotSchema,
  SnapshotSizeSchema,
} from './snapshot.js';

describe('SnapshotBuildStatus', () => {
  test('accepts valid statuses', () => {
    for (const s of ['building', 'ready', 'failed'] as const) {
      expect(SnapshotBuildStatus.parse(s)).toBe(s);
    }
  });

  test('rejects invalid status', () => {
    expect(() => SnapshotBuildStatus.parse('pending')).toThrow();
  });
});

describe('SnapshotSizeSchema', () => {
  test('accepts valid size', () => {
    const result = SnapshotSizeSchema.parse({
      disk: '4.0 GB',
      memory: '4.0 GB',
      total: '8.0 GB',
    });
    expect(result.disk).toBe('4.0 GB');
  });
});

describe('SnapshotBuildRequestSchema', () => {
  test('accepts valid request', () => {
    const result = SnapshotBuildRequestSchema.parse({
      base: 'ubuntu-24.04',
      setup: 'apt-get update && apt-get install -y nodejs',
    });
    expect(result.base).toBe('ubuntu-24.04');
  });

  test('accepts request with resources', () => {
    const result = SnapshotBuildRequestSchema.parse({
      base: 'ubuntu-24.04',
      setup: 'echo hi',
      resources: { vcpus: 4, memoryMB: 8192 },
    });
    expect(result.resources?.vcpus).toBe(4);
  });

  test('rejects empty base', () => {
    expect(() => SnapshotBuildRequestSchema.parse({ base: '', setup: 'echo' })).toThrow();
  });
});

describe('SnapshotSchema', () => {
  test('accepts valid snapshot', () => {
    const result = SnapshotSchema.parse({
      id: 'claude-agent',
      version: 3,
      createdAt: '2026-03-25T10:00:00Z',
      size: { disk: '4.0 GB', memory: '4.0 GB', total: '8.0 GB' },
      config: { vcpus: 2, memoryMB: 4096 },
    });
    expect(result.id).toBe('claude-agent');
    expect(result.version).toBe(3);
  });
});

describe('SnapshotBuildResponseSchema', () => {
  test('accepts valid response', () => {
    const result = SnapshotBuildResponseSchema.parse({
      snapshotId: 'claude-agent',
      status: 'building',
      jobId: 'build-a1b2c3d4',
    });
    expect(result.status).toBe('building');
  });
});

describe('SnapshotListResponseSchema', () => {
  test('accepts valid list', () => {
    const result = SnapshotListResponseSchema.parse({
      snapshots: [
        {
          id: 'claude-agent',
          version: 1,
          createdAt: '2026-03-25T10:00:00Z',
          size: { disk: '4.0 GB', memory: '4.0 GB', total: '8.0 GB' },
          config: { vcpus: 2, memoryMB: 4096 },
        },
      ],
    });
    expect(result.snapshots).toHaveLength(1);
  });

  test('accepts empty list', () => {
    const result = SnapshotListResponseSchema.parse({ snapshots: [] });
    expect(result.snapshots).toEqual([]);
  });
});
