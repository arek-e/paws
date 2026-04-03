import { describe, expect, test } from 'vitest';

import type { CreateDaemonRequest } from './types.js';

import { createDaemonStore } from './store.js';

function makeRequest(overrides?: Partial<CreateDaemonRequest>): CreateDaemonRequest {
  return {
    role: 'test-daemon',
    description: 'A test daemon',
    snapshot: 'agent-latest',
    trigger: { type: 'webhook', events: ['push'] },
    workload: { type: 'script', script: 'echo hello', env: {} },
    ...overrides,
  };
}

describe('createDaemonStore', () => {
  test('create stores a daemon and returns it', () => {
    const store = createDaemonStore();
    const daemon = store.create(makeRequest());
    expect(daemon.role).toBe('test-daemon');
    expect(daemon.status).toBe('active');
    expect(daemon.stats.totalInvocations).toBe(0);
  });

  test('get returns a stored daemon', () => {
    const store = createDaemonStore();
    store.create(makeRequest());
    const got = store.get('test-daemon');
    expect(got).toBeDefined();
    expect(got?.role).toBe('test-daemon');
  });

  test('get returns undefined for unknown role', () => {
    const store = createDaemonStore();
    expect(store.get('unknown')).toBeUndefined();
  });

  test('list returns all daemons', () => {
    const store = createDaemonStore();
    store.create(makeRequest({ role: 'd-1' }));
    store.create(makeRequest({ role: 'd-2' }));
    expect(store.list()).toHaveLength(2);
  });

  test('update patches a daemon', () => {
    const store = createDaemonStore();
    store.create(makeRequest());
    const updated = store.update('test-daemon', { description: 'updated' });
    expect(updated?.description).toBe('updated');
    expect(store.get('test-daemon')?.description).toBe('updated');
  });

  test('update returns undefined for unknown role', () => {
    const store = createDaemonStore();
    expect(store.update('unknown', { description: 'nope' })).toBeUndefined();
  });

  test('delete removes a daemon', () => {
    const store = createDaemonStore();
    store.create(makeRequest());
    const result = store.delete('test-daemon');
    expect(result).toBe(true);
    expect(store.get('test-daemon')).toBeUndefined();
  });

  test('delete returns false for unknown role', () => {
    const store = createDaemonStore();
    expect(store.delete('unknown')).toBe(false);
  });

  test('recordInvocation increments stats', () => {
    const store = createDaemonStore();
    store.create(makeRequest());
    store.recordInvocation('test-daemon', 5000, 10);
    const daemon = store.get('test-daemon');
    expect(daemon?.stats.totalInvocations).toBe(1);
    expect(daemon?.stats.totalDurationMs).toBe(5000);
    expect(daemon?.stats.totalVcpuSeconds).toBe(10);
    expect(daemon?.stats.lastInvokedAt).toBeDefined();
  });

  test('countActive counts only active daemons', () => {
    const store = createDaemonStore();
    store.create(makeRequest({ role: 'd-1' }));
    store.create(makeRequest({ role: 'd-2' }));
    store.update('d-2', { status: 'paused' });
    expect(store.countActive()).toBe(1);
  });
});
