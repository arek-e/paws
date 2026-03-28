import { describe, expect, it } from 'vitest';

import { createBuildStore } from './builds.js';

describe('createBuildStore', () => {
  it('creates and retrieves a build', () => {
    const store = createBuildStore();
    const build = store.create('job-1', 'test-snapshot');

    expect(build.jobId).toBe('job-1');
    expect(build.snapshotId).toBe('test-snapshot');
    expect(build.status).toBe('building');
    expect(build.startedAt).toBeDefined();

    expect(store.get('job-1')).toBe(build);
  });

  it('returns undefined for unknown jobId', () => {
    const store = createBuildStore();
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('updates status to ready', () => {
    const store = createBuildStore();
    store.create('job-1', 'snap');
    store.updateStatus('job-1', 'ready', { completedAt: '2026-01-01T00:00:00Z' });

    const build = store.get('job-1')!;
    expect(build.status).toBe('ready');
    expect(build.completedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('updates status to failed with error', () => {
    const store = createBuildStore();
    store.create('job-1', 'snap');
    store.updateStatus('job-1', 'failed', {
      error: 'Build script exited with code 1',
      completedAt: '2026-01-01T00:00:00Z',
    });

    const build = store.get('job-1')!;
    expect(build.status).toBe('failed');
    expect(build.error).toBe('Build script exited with code 1');
  });

  it('ignores updateStatus for unknown jobId', () => {
    const store = createBuildStore();
    store.updateStatus('nonexistent', 'ready');
    expect(store.get('nonexistent')).toBeUndefined();
  });
});
