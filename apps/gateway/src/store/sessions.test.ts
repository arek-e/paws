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

  test('counts active sessions', () => {
    const store = createSessionStore();
    store.create('s1', makeRequest());
    store.create('s2', makeRequest());
    store.create('s3', makeRequest());
    store.updateStatus('s3', 'completed');

    expect(store.countActiveSessions()).toBe(2);
  });
});
