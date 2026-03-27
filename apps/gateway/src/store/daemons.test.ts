import { describe, expect, test } from 'vitest';

import { createDaemonStore } from './daemons.js';

const makeDaemonRequest = (role = 'test-daemon') => ({
  role,
  description: 'A test daemon',
  snapshot: 'test-snap',
  trigger: { type: 'webhook' as const, events: ['push'] },
  workload: { type: 'script' as const, script: 'echo hi', env: {} },
});

describe('createDaemonStore', () => {
  test('creates and retrieves a daemon', () => {
    const store = createDaemonStore();
    const daemon = store.create(makeDaemonRequest());
    expect(daemon.role).toBe('test-daemon');
    expect(daemon.status).toBe('active');
    expect(store.get('test-daemon')).toBeDefined();
  });

  test('lists all daemons', () => {
    const store = createDaemonStore();
    store.create(makeDaemonRequest('d1'));
    store.create(makeDaemonRequest('d2'));
    expect(store.list()).toHaveLength(2);
  });

  test('updates a daemon', () => {
    const store = createDaemonStore();
    store.create(makeDaemonRequest());
    const updated = store.update('test-daemon', { description: 'Updated' });
    expect(updated).toBeDefined();
    expect(updated!.description).toBe('Updated');
  });

  test('returns undefined when updating nonexistent daemon', () => {
    const store = createDaemonStore();
    expect(store.update('nope', { description: 'x' })).toBeUndefined();
  });

  test('deletes a daemon', () => {
    const store = createDaemonStore();
    store.create(makeDaemonRequest());
    expect(store.delete('test-daemon')).toBe(true);
    expect(store.get('test-daemon')).toBeUndefined();
  });

  test('returns false when deleting nonexistent daemon', () => {
    const store = createDaemonStore();
    expect(store.delete('nope')).toBe(false);
  });

  test('records invocations', () => {
    const store = createDaemonStore();
    store.create(makeDaemonRequest());
    store.recordInvocation('test-daemon', 5000);
    store.recordInvocation('test-daemon', 3000);

    const daemon = store.get('test-daemon')!;
    expect(daemon.stats.totalInvocations).toBe(2);
    expect(daemon.stats.totalDurationMs).toBe(8000);
    expect(daemon.stats.lastInvokedAt).toBeDefined();
  });

  test('counts active daemons', () => {
    const store = createDaemonStore();
    store.create(makeDaemonRequest('d1'));
    store.create(makeDaemonRequest('d2'));
    store.delete('d2');
    expect(store.countActive()).toBe(1);
  });
});
