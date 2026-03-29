import { describe, expect, test } from 'vitest';

import { createSessionStore } from './sessions.js';

const makeRequest = (snapshot = 'test') => ({
  snapshot,
  workload: { type: 'script' as const, script: 'echo hi', env: {} },
  timeoutMs: 60000,
});

describe('createSessionStore', () => {
  test('creates and retrieves a session', () => {
    const store = createSessionStore();
    const session = store.create('s1', makeRequest());
    expect(session.sessionId).toBe('s1');
    expect(session.status).toBe('pending');

    const retrieved = store.get('s1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.sessionId).toBe('s1');
  });

  test('returns undefined for unknown session', () => {
    const store = createSessionStore();
    expect(store.get('nonexistent')).toBeUndefined();
  });

  test('updates session status', () => {
    const store = createSessionStore();
    store.create('s1', makeRequest());
    store.updateStatus('s1', 'running', { startedAt: '2026-01-01T00:00:00Z' });

    const session = store.get('s1')!;
    expect(session.status).toBe('running');
    expect(session.startedAt).toBe('2026-01-01T00:00:00Z');
  });

  test('lists sessions by daemon role', () => {
    const store = createSessionStore();
    store.create('s1', makeRequest(), 'my-daemon');
    store.create('s2', makeRequest(), 'my-daemon');
    store.create('s3', makeRequest(), 'other-daemon');

    const results = store.listByDaemon('my-daemon');
    expect(results).toHaveLength(2);
  });

  test('lists all sessions newest first', () => {
    const store = createSessionStore();
    store.create('s1', makeRequest());
    store.create('s2', makeRequest());
    store.create('s3', makeRequest());

    const results = store.listAll();
    expect(results).toHaveLength(3);
    expect(results[0]!.sessionId).toBe('s3');
    expect(results[2]!.sessionId).toBe('s1');
  });

  test('listAll respects limit', () => {
    const store = createSessionStore();
    store.create('s1', makeRequest());
    store.create('s2', makeRequest());
    store.create('s3', makeRequest());

    const results = store.listAll(2);
    expect(results).toHaveLength(2);
    expect(results[0]!.sessionId).toBe('s3');
    expect(results[1]!.sessionId).toBe('s2');
  });

  test('counts active sessions', () => {
    const store = createSessionStore();
    store.create('s1', makeRequest());
    store.create('s2', makeRequest());
    store.create('s3', makeRequest());
    store.updateStatus('s3', 'completed');

    expect(store.countActiveSessions()).toBe(2);
  });

  test('captures default resources at creation', () => {
    const store = createSessionStore();
    const session = store.create('s1', makeRequest());
    expect(session.resources).toEqual({ vcpus: 2, memoryMB: 4096 });
  });

  test('captures explicit resources at creation', () => {
    const store = createSessionStore();
    const session = store.create('s1', {
      ...makeRequest(),
      resources: { vcpus: 4, memoryMB: 8192 },
    });
    expect(session.resources).toEqual({ vcpus: 4, memoryMB: 8192 });
  });

  test('computes vcpuSeconds on completion with duration', () => {
    const store = createSessionStore();
    store.create('s1', {
      ...makeRequest(),
      resources: { vcpus: 4, memoryMB: 8192 },
    });
    store.updateStatus('s1', 'completed', { durationMs: 10_000 });
    const session = store.get('s1')!;
    expect(session.vcpuSeconds).toBe(40); // 4 vcpus × 10 seconds
  });

  test('does not compute vcpuSeconds without duration', () => {
    const store = createSessionStore();
    store.create('s1', makeRequest());
    store.updateStatus('s1', 'completed');
    const session = store.get('s1')!;
    expect(session.vcpuSeconds).toBeUndefined();
  });

  test('computes vcpuSeconds on failed/timeout states', () => {
    const store = createSessionStore();
    store.create('s1', makeRequest()); // default 2 vcpus
    store.updateStatus('s1', 'timeout', { durationMs: 600_000 });
    const session = store.get('s1')!;
    expect(session.vcpuSeconds).toBe(1200); // 2 vcpus × 600 seconds
  });
});
