import { describe, expect, test, vi } from 'vitest';

import { createSessionApp } from './routes.js';
import { createSemaphore } from './semaphore.js';

/** Create a mock executor for testing */
function createMockExecutor() {
  const activeSessions = new Map();
  return {
    execute: vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'hello',
      stderr: '',
      output: undefined,
      durationMs: 100,
    }),
    get activeSessions() {
      return activeSessions;
    },
    get poolStats() {
      return { allocated: 0, available: 256 };
    },
  };
}

function createApp() {
  const semaphore = createSemaphore(5, 10);
  const executor = createMockExecutor();
  const app = createSessionApp({
    executor: executor as never,
    semaphore,
    workerName: 'test-worker',
  });
  return { app, executor, semaphore };
}

describe('GET /health', () => {
  test('returns healthy status', async () => {
    const { app } = createApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.worker).toBe('test-worker');
    expect(body.capacity).toMatchObject({
      running: 0,
      queued: 0,
      available: 5,
    });
    expect(body.pool).toMatchObject({
      allocated: 0,
      available: 256,
    });
    expect(body.snapshot).toMatchObject({
      syncEnabled: false,
      currentVersion: 0,
      syncing: false,
      lastCheck: null,
      lastError: null,
    });
  });

  test('includes sync loop status when provided', async () => {
    const semaphore = createSemaphore(5, 10);
    const executor = createMockExecutor();
    const mockSyncLoop = {
      start: vi.fn(),
      stop: vi.fn(),
      _tick: vi.fn(),
      status: () => ({
        currentVersion: 3,
        syncing: false,
        lastCheck: new Date('2026-03-28T00:00:00Z'),
        lastError: null,
      }),
    };
    const app = createSessionApp({
      executor: executor as never,
      semaphore,
      workerName: 'test-worker',
      syncLoop: mockSyncLoop,
    });

    const res = await app.request('/health');
    const body = await res.json();
    expect(body.snapshot).toMatchObject({
      syncEnabled: true,
      currentVersion: 3,
      syncing: false,
      lastCheck: '2026-03-28T00:00:00.000Z',
      lastError: null,
    });
  });
});

describe('POST /v1/sessions', () => {
  test('returns 202 with sessionId', async () => {
    const { app } = createApp();
    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snapshot: 'test-snapshot',
        workload: { type: 'script', script: 'echo hi' },
      }),
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe('pending');
    expect(body.sessionId).toBeDefined();
    expect(typeof body.sessionId).toBe('string');
  });

  test('returns 400 for invalid JSON', async () => {
    const { app } = createApp();
    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 for missing required fields', async () => {
    const { app } = createApp();
    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('fires executor in background', async () => {
    const { app, executor } = createApp();
    await app.request('/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snapshot: 'test-snapshot',
        workload: { type: 'script', script: 'echo hi' },
      }),
    });

    // Executor should have been called
    expect(executor.execute).toHaveBeenCalledOnce();
    const [sessionId, request] = executor.execute.mock.calls[0]!;
    expect(typeof sessionId).toBe('string');
    expect(request.snapshot).toBe('test-snapshot');
  });
});

describe('GET /v1/sessions/:id', () => {
  test('returns 404 for unknown session', async () => {
    const { app } = createApp();
    const res = await app.request('/v1/sessions/unknown-id');
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error.code).toBe('SESSION_NOT_FOUND');
  });

  test('returns running session from active sessions', async () => {
    const { app, executor } = createApp();
    const sessionId = 'test-session-123';
    (executor.activeSessions as Map<string, unknown>).set(sessionId, {
      sessionId,
      status: 'running',
      startedAt: new Date('2026-01-01T00:00:00Z'),
    });

    const res = await app.request(`/v1/sessions/${sessionId}`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.sessionId).toBe(sessionId);
    expect(body.status).toBe('running');
    expect(body.worker).toBe('test-worker');
  });
});
