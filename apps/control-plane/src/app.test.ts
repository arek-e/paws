import { describe, expect, test } from 'vitest';

import { createControlPlaneApp } from './app.js';
import type { WorkerClient } from './worker-client.js';

const API_KEY = 'test-api-key';
const AUTH = { Authorization: `Bearer ${API_KEY}` };
const JSON_HEADERS = { ...AUTH, 'Content-Type': 'application/json' };

function createMockWorkerClient(overrides?: Partial<WorkerClient>): WorkerClient {
  return {
    health: async () => ({
      status: 'healthy',
      worker: 'test-worker',
      uptime: 1000,
      capacity: { maxConcurrent: 5, running: 0, queued: 0, available: 5 },
    }),
    createSession: async (sessionId) => ({ sessionId, status: 'pending' }),
    getSession: async () => undefined,
    buildSnapshot: async () => {},
    ...overrides,
  };
}

async function createApp(workerOverrides?: Partial<WorkerClient>) {
  return createControlPlaneApp({
    apiKey: API_KEY,
    workerClient: createMockWorkerClient(workerOverrides),
  });
}

// --- Health ---

describe('GET /health', () => {
  test('returns healthy status without auth', async () => {
    const app = await createApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.version).toBe('0.1.0');
    expect(typeof body.uptime).toBe('number');
  });
});

// --- Auth ---

describe('auth middleware', () => {
  test('rejects missing auth header', async () => {
    const app = await createApp();
    const res = await app.request('/v1/sessions', { method: 'POST' });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  test('rejects invalid API key', async () => {
    const app = await createApp();
    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-key' },
    });
    expect(res.status).toBe(401);
  });
});

// --- Sessions ---

describe('POST /v1/sessions', () => {
  test('creates session and returns 202', async () => {
    const app = await createApp();
    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        snapshot: 'test-snapshot',
        workload: { type: 'script', script: 'echo hello' },
      }),
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.sessionId).toBeDefined();
    expect(body.status).toBe('pending');
  });

  test('rejects invalid body', async () => {
    const app = await createApp();
    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ snapshot: '' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/sessions', () => {
  test('returns empty list when no sessions', async () => {
    const app = await createApp();
    const res = await app.request('/v1/sessions', { headers: AUTH });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toEqual([]);
  });

  test('lists sessions after creation', async () => {
    const app = await createApp();
    await app.request('/v1/sessions', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        snapshot: 'test',
        workload: { type: 'script', script: 'echo hi' },
      }),
    });

    const res = await app.request('/v1/sessions', { headers: AUTH });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].sessionId).toBeDefined();
  });

  test('respects limit query param', async () => {
    const app = await createApp();
    for (let i = 0; i < 3; i++) {
      await app.request('/v1/sessions', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          snapshot: 'test',
          workload: { type: 'script', script: 'echo hi' },
        }),
      });
    }

    const res = await app.request('/v1/sessions?limit=2', { headers: AUTH });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(2);
  });
});

describe('GET /v1/sessions/:id', () => {
  test('returns session after creation', async () => {
    const app = await createApp();
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        snapshot: 'test',
        workload: { type: 'script', script: 'echo hi' },
      }),
    });
    const { sessionId } = await createRes.json();

    const getRes = await app.request(`/v1/sessions/${sessionId}`, {
      headers: AUTH,
    });
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.sessionId).toBe(sessionId);
    expect(['pending', 'running']).toContain(body.status);
  });

  test('returns 404 for unknown session', async () => {
    const app = await createApp();
    const res = await app.request('/v1/sessions/00000000-0000-0000-0000-000000000000', {
      headers: AUTH,
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('SESSION_NOT_FOUND');
  });
});

describe('DELETE /v1/sessions/:id', () => {
  test('cancels existing session', async () => {
    const app = await createApp();
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        snapshot: 'test',
        workload: { type: 'script', script: 'echo hi' },
      }),
    });
    const { sessionId } = await createRes.json();

    const delRes = await app.request(`/v1/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(delRes.status).toBe(200);
    const body = await delRes.json();
    expect(body.status).toBe('cancelled');
  });
});

// --- Daemons ---

const DAEMON_BODY = {
  role: 'test-daemon',
  description: 'A test daemon',
  snapshot: 'test-snapshot',
  trigger: { type: 'webhook' as const, events: ['push'] },
  workload: { type: 'script' as const, script: 'echo hello' },
};

describe('POST /v1/daemons', () => {
  test('registers a new daemon', async () => {
    const app = await createApp();
    const res = await app.request('/v1/daemons', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(DAEMON_BODY),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.role).toBe('test-daemon');
    expect(body.status).toBe('active');
    expect(body.createdAt).toBeDefined();
  });

  test('rejects duplicate daemon', async () => {
    const app = await createApp();
    await app.request('/v1/daemons', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(DAEMON_BODY),
    });
    const res = await app.request('/v1/daemons', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(DAEMON_BODY),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('DAEMON_ALREADY_EXISTS');
  });
});

describe('GET /v1/daemons', () => {
  test('lists registered daemons', async () => {
    const app = await createApp();
    await app.request('/v1/daemons', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(DAEMON_BODY),
    });

    const res = await app.request('/v1/daemons', { headers: AUTH });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.daemons).toHaveLength(1);
    expect(body.daemons[0].role).toBe('test-daemon');
  });
});

describe('GET /v1/daemons/:role', () => {
  test('returns daemon detail', async () => {
    const app = await createApp();
    await app.request('/v1/daemons', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(DAEMON_BODY),
    });

    const res = await app.request('/v1/daemons/test-daemon', { headers: AUTH });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('test-daemon');
    expect(body.governance).toBeDefined();
    expect(body.recentSessions).toEqual([]);
  });

  test('returns 404 for unknown daemon', async () => {
    const app = await createApp();
    const res = await app.request('/v1/daemons/nonexistent', { headers: AUTH });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /v1/daemons/:role', () => {
  test('updates daemon config', async () => {
    const app = await createApp();
    await app.request('/v1/daemons', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(DAEMON_BODY),
    });

    const res = await app.request('/v1/daemons/test-daemon', {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ description: 'Updated description' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.description).toBe('Updated description');
  });
});

describe('DELETE /v1/daemons/:role', () => {
  test('deletes daemon', async () => {
    const app = await createApp();
    await app.request('/v1/daemons', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(DAEMON_BODY),
    });

    const res = await app.request('/v1/daemons/test-daemon', {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('stopped');

    // Verify gone
    const getRes = await app.request('/v1/daemons/test-daemon', { headers: AUTH });
    expect(getRes.status).toBe(404);
  });
});

// --- Webhooks ---

describe('POST /v1/webhooks/:role', () => {
  test('triggers session for webhook daemon', async () => {
    const app = await createApp();
    await app.request('/v1/daemons', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(DAEMON_BODY),
    });

    const res = await app.request('/v1/webhooks/test-daemon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'push' }),
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.accepted).toBe(true);
    expect(body.sessionId).toBeDefined();
  });

  test('returns 404 for unknown daemon', async () => {
    const app = await createApp();
    const res = await app.request('/v1/webhooks/nonexistent', {
      method: 'POST',
    });
    expect(res.status).toBe(404);
  });

  test('rate limits webhook triggers', async () => {
    const app = await createApp();
    await app.request('/v1/daemons', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        ...DAEMON_BODY,
        governance: { maxActionsPerHour: 1 },
      }),
    });

    // First trigger succeeds
    const res1 = await app.request('/v1/webhooks/test-daemon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res1.status).toBe(202);

    // Second trigger is rate limited
    const res2 = await app.request('/v1/webhooks/test-daemon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res2.status).toBe(429);
    const body = await res2.json();
    expect(body.error.code).toBe('RATE_LIMITED');
  });
});

// --- Fleet ---

describe('GET /v1/fleet', () => {
  test('returns fleet overview', async () => {
    const app = await createApp();
    const res = await app.request('/v1/fleet', { headers: AUTH });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalWorkers).toBe(1);
    expect(body.healthyWorkers).toBe(1);
    expect(body.totalCapacity).toBe(5);
  });

  test('handles worker down gracefully', async () => {
    const app = await createApp({
      health: async () => {
        throw new Error('connection refused');
      },
    });
    const res = await app.request('/v1/fleet', { headers: AUTH });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalWorkers).toBe(0);
  });
});

describe('GET /v1/fleet/workers', () => {
  test('returns worker list', async () => {
    const app = await createApp();
    const res = await app.request('/v1/fleet/workers', { headers: AUTH });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workers).toHaveLength(1);
    expect(body.workers[0].name).toBe('test-worker');
  });
});

// --- Snapshots ---

describe('GET /v1/snapshots', () => {
  test('returns empty list for v0.1', async () => {
    const app = await createApp();
    const res = await app.request('/v1/snapshots', { headers: AUTH });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.snapshots).toEqual([]);
  });
});

describe('POST /v1/snapshots/:id/build', () => {
  test('returns build placeholder', async () => {
    const app = await createApp();
    const res = await app.request('/v1/snapshots/test-snap/build', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ base: 'ubuntu-24.04', setup: 'apt-get update' }),
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.snapshotId).toBe('test-snap');
    expect(body.status).toBe('building');
  });
});

// --- OpenAPI spec ---

describe('GET /openapi.json', () => {
  test('returns OpenAPI spec', async () => {
    const app = await createApp();
    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe('3.1.0');
    expect(body.info.title).toBe('paws Control Plane API');
    expect(body.paths).toBeDefined();
  });
});
