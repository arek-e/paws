import { describe, expect, test } from 'vitest';

import type { CreateSessionRequest } from './types.js';

import { createSessionStore } from './store.js';

function makeRequest(overrides?: Partial<CreateSessionRequest>): CreateSessionRequest {
  return {
    snapshot: 'agent-latest',
    workload: { type: 'script', script: 'echo hello', env: {} },
    timeoutMs: 600_000,
    ...overrides,
  };
}

describe('createSessionStore', () => {
  test('create stores a session and returns it', () => {
    const store = createSessionStore();
    const session = store.create('s-1', makeRequest());
    expect(session.sessionId).toBe('s-1');
    expect(session.status).toBe('pending');
    expect(session.resources).toEqual({ vcpus: 2, memoryMB: 4096 });
  });

  test('get returns a stored session', () => {
    const store = createSessionStore();
    store.create('s-1', makeRequest());
    const got = store.get('s-1');
    expect(got).toBeDefined();
    expect(got?.sessionId).toBe('s-1');
  });

  test('get returns undefined for unknown session', () => {
    const store = createSessionStore();
    expect(store.get('unknown')).toBeUndefined();
  });

  test('updateStatus changes session status', () => {
    const store = createSessionStore();
    store.create('s-1', makeRequest());
    store.updateStatus('s-1', 'running');
    expect(store.get('s-1')?.status).toBe('running');
  });

  test('updateStatus merges partial result', () => {
    const store = createSessionStore();
    store.create('s-1', makeRequest());
    store.updateStatus('s-1', 'completed', {
      exitCode: 0,
      stdout: 'ok',
      durationMs: 5000,
    });
    const session = store.get('s-1');
    expect(session?.status).toBe('completed');
    expect(session?.exitCode).toBe(0);
    expect(session?.stdout).toBe('ok');
  });

  test('updateStatus computes vcpuSeconds on terminal state', () => {
    const store = createSessionStore();
    store.create('s-1', makeRequest({ resources: { vcpus: 4, memoryMB: 4096 } }));
    store.updateStatus('s-1', 'completed', { durationMs: 10_000 });
    const session = store.get('s-1');
    // 4 vcpus * 10s = 40 vcpu-seconds
    expect(session?.vcpuSeconds).toBe(40);
  });

  test('updateStatus is a no-op for unknown session', () => {
    const store = createSessionStore();
    // Should not throw
    store.updateStatus('unknown', 'running');
  });

  test('listAll returns sessions in reverse insertion order', () => {
    const store = createSessionStore();
    store.create('s-1', makeRequest());
    store.create('s-2', makeRequest());
    store.create('s-3', makeRequest());
    const all = store.listAll();
    expect(all.map((s) => s.sessionId)).toEqual(['s-3', 's-2', 's-1']);
  });

  test('listAll respects limit', () => {
    const store = createSessionStore();
    store.create('s-1', makeRequest());
    store.create('s-2', makeRequest());
    store.create('s-3', makeRequest());
    const limited = store.listAll(2);
    expect(limited).toHaveLength(2);
  });

  test('countActiveSessions counts pending and running', () => {
    const store = createSessionStore();
    store.create('s-1', makeRequest());
    store.create('s-2', makeRequest());
    store.updateStatus('s-1', 'running');
    store.updateStatus('s-2', 'completed');
    store.create('s-3', makeRequest());
    // s-1 running + s-3 pending = 2 active
    expect(store.countActiveSessions()).toBe(2);
  });
});
