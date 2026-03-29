import { describe, expect, it, vi } from 'vitest';

import { createClient } from './client.js';
import { PawsApiError, PawsNetworkError } from './errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(status: number, body: unknown): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

function client(fetch: typeof globalThis.fetch) {
  return createClient({
    baseUrl: 'http://localhost:4000',
    apiKey: 'test-key',
    fetch,
  });
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

describe('sessions', () => {
  it('lists sessions', async () => {
    const body = { sessions: [{ sessionId: 'abc-123', status: 'running' }] };
    const fetch = mockFetch(200, body);
    const c = client(fetch);

    const result = await c.sessions.list();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(body);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/v1/sessions',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('lists sessions with limit', async () => {
    const body = { sessions: [] };
    const fetch = mockFetch(200, body);
    const c = client(fetch);

    await c.sessions.list({ limit: 10 });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/v1/sessions?limit=10',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('creates a session', async () => {
    const body = { sessionId: 'abc-123', status: 'pending' };
    const fetch = mockFetch(202, body);
    const c = client(fetch);

    const result = await c.sessions.create({
      snapshot: 'test-minimal',
      workload: { type: 'script', script: 'echo hi', env: {} },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(body);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/v1/sessions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('gets a session', async () => {
    const body = { sessionId: 'abc-123', status: 'running' };
    const fetch = mockFetch(200, body);
    const c = client(fetch);

    const result = await c.sessions.get('abc-123');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(body);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/v1/sessions/abc-123',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('cancels a session', async () => {
    const body = { sessionId: 'abc-123', status: 'cancelled' };
    const fetch = mockFetch(200, body);
    const c = client(fetch);

    const result = await c.sessions.cancel('abc-123');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(body);
  });

  it('polls until session completes', async () => {
    let callCount = 0;
    const fetch = vi.fn().mockImplementation(() => {
      callCount++;
      const status = callCount < 3 ? 'running' : 'completed';
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            sessionId: 'abc-123',
            status,
            exitCode: callCount < 3 ? undefined : 0,
          }),
      });
    });
    const c = client(fetch);

    const result = await c.sessions.waitForCompletion('abc-123', { intervalMs: 10 });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().status).toBe('completed');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('returns failed session without error', async () => {
    const body = { sessionId: 'abc-123', status: 'failed', stderr: 'boom' };
    const fetch = mockFetch(200, body);
    const c = client(fetch);

    const result = await c.sessions.waitForCompletion('abc-123', { intervalMs: 10 });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().status).toBe('failed');
  });

  it('times out while polling', async () => {
    const fetch = mockFetch(200, { sessionId: 'abc-123', status: 'running' });
    const c = client(fetch);

    const result = await c.sessions.waitForCompletion('abc-123', {
      intervalMs: 10,
      timeoutMs: 50,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(PawsNetworkError);
  });
});

// ---------------------------------------------------------------------------
// Daemons
// ---------------------------------------------------------------------------

describe('daemons', () => {
  it('creates a daemon', async () => {
    const body = { role: 'pr-reviewer', status: 'active', createdAt: '2026-01-01T00:00:00Z' };
    const fetch = mockFetch(201, body);
    const c = client(fetch);

    const result = await c.daemons.create({
      role: 'pr-reviewer',
      snapshot: 'agent-latest',
      trigger: { type: 'webhook', events: ['pull_request'] },
      workload: { type: 'script', script: 'review.sh', env: {} },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(body);
  });

  it('lists daemons', async () => {
    const body = { daemons: [] };
    const fetch = mockFetch(200, body);
    const c = client(fetch);

    const result = await c.daemons.list();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(body);
  });

  it('gets a daemon by role', async () => {
    const fetch = mockFetch(200, { role: 'pr-reviewer', status: 'active' });
    const c = client(fetch);

    const result = await c.daemons.get('pr-reviewer');

    expect(result.isOk()).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/v1/daemons/pr-reviewer',
      expect.anything(),
    );
  });

  it('encodes role in URL', async () => {
    const fetch = mockFetch(200, {});
    const c = client(fetch);

    await c.daemons.get('role with spaces');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/v1/daemons/role%20with%20spaces',
      expect.anything(),
    );
  });

  it('updates a daemon', async () => {
    const fetch = mockFetch(200, { role: 'pr-reviewer' });
    const c = client(fetch);

    const result = await c.daemons.update('pr-reviewer', {
      description: 'Updated description',
    } as import('@paws/types').UpdateDaemonRequest);

    expect(result.isOk()).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/v1/daemons/pr-reviewer',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('deletes a daemon', async () => {
    const fetch = mockFetch(200, { role: 'pr-reviewer', status: 'stopped' });
    const c = client(fetch);

    const result = await c.daemons.delete('pr-reviewer');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ role: 'pr-reviewer', status: 'stopped' });
  });
});

// ---------------------------------------------------------------------------
// Fleet
// ---------------------------------------------------------------------------

describe('fleet', () => {
  it('gets fleet overview', async () => {
    const body = {
      totalWorkers: 2,
      healthyWorkers: 2,
      totalCapacity: 10,
      usedCapacity: 3,
      queuedSessions: 0,
      activeDaemons: 1,
      activeSessions: 3,
    };
    const fetch = mockFetch(200, body);
    const c = client(fetch);

    const result = await c.fleet.overview();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(body);
  });

  it('lists workers', async () => {
    const fetch = mockFetch(200, { workers: [] });
    const c = client(fetch);

    const result = await c.fleet.workers();

    expect(result.isOk()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

describe('snapshots', () => {
  it('lists snapshots', async () => {
    const fetch = mockFetch(200, { snapshots: [] });
    const c = client(fetch);

    const result = await c.snapshots.list();

    expect(result.isOk()).toBe(true);
  });

  it('triggers snapshot build', async () => {
    const body = { snapshotId: 'test', status: 'building', jobId: 'build-abc123' };
    const fetch = mockFetch(202, body);
    const c = client(fetch);

    const result = await c.snapshots.build('test', {
      base: 'ubuntu-default',
      setup: 'apt-get install -y curl',
    });

    expect(result.isOk()).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/v1/snapshots/test/build',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

describe('webhooks', () => {
  it('triggers a webhook', async () => {
    const body = { accepted: true, sessionId: 'abc-123' };
    const fetch = mockFetch(202, body);
    const c = client(fetch);

    const result = await c.webhooks.trigger('pr-reviewer', { action: 'opened' });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(body);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/v1/webhooks/pr-reviewer',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('returns PawsApiError for 4xx/5xx responses', async () => {
    const fetch = mockFetch(404, {
      error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
    });
    const c = client(fetch);

    const result = await c.sessions.get('nonexistent');

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error).toBeInstanceOf(PawsApiError);
    expect((error as PawsApiError).code).toBe('SESSION_NOT_FOUND');
    expect((error as PawsApiError).status).toBe(404);
  });

  it('returns PawsNetworkError for fetch failures', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const c = client(fetch);

    const result = await c.sessions.get('abc');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(PawsNetworkError);
  });

  it('sends Authorization header on all requests', async () => {
    const fetch = mockFetch(200, {});
    const c = client(fetch);

    await c.fleet.overview();

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    );
  });

  it('does not send Content-Type for GET requests', async () => {
    const fetch = mockFetch(200, {});
    const c = client(fetch);

    await c.fleet.overview();

    const callHeaders = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].headers;
    expect(callHeaders['Content-Type']).toBeUndefined();
  });
});
