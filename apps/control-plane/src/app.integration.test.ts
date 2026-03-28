/**
 * Tier 2: Control plane integration test
 *
 * Boots the real Hono server on a random port and exercises every endpoint
 * over HTTP to catch wiring issues beyond unit-test mocking.
 *
 * NOTE: Uses Bun.serve to start the server — skips automatically when
 * running under vitest without Bun runtime globals.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createControlPlaneApp } from './app.js';
import type { WorkerClient, WorkerHealth, WorkerSessionResult } from './worker-client.js';

// Bun.serve is used to boot the server — skip if Bun runtime isn't available
const hasBun = typeof (globalThis as Record<string, unknown>).Bun !== 'undefined';

function createMockWorkerClient(): WorkerClient {
  const sessions = new Map<string, WorkerSessionResult>();
  return {
    async health(): Promise<WorkerHealth> {
      return {
        status: 'healthy',
        worker: 'mock-worker',
        uptime: 100,
        capacity: { maxConcurrent: 5, running: 0, queued: 0, available: 5 },
      };
    },
    async createSession(sessionId, _request) {
      sessions.set(sessionId, { sessionId, status: 'running' });
      return { sessionId, status: 'pending' };
    },
    async getSession(sessionId) {
      return sessions.get(sessionId);
    },
  };
}

describe.skipIf(!hasBun)('Control plane integration — real HTTP', () => {
  let server: ReturnType<typeof Bun.serve>;
  let baseUrl: string;
  const API_KEY = 'test-integration-key';

  beforeAll(async () => {
    const app = await createControlPlaneApp({
      apiKey: API_KEY,
      workerClient: createMockWorkerClient(),
    });

    server = Bun.serve({
      port: 0,
      fetch: app.fetch,
    });
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(() => {
    server?.stop();
  });

  const AUTH = { Authorization: `Bearer ${API_KEY}` };
  const JSON_HEADERS = { ...AUTH, 'Content-Type': 'application/json' };

  const DAEMON_BODY = {
    role: 'test-daemon',
    description: 'A test daemon',
    snapshot: 'test-snapshot',
    trigger: { type: 'webhook' as const, events: ['push'] },
    workload: { type: 'script' as const, script: 'echo hello' },
  };

  test('GET /health returns 200 with healthy status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.version).toBe('0.1.0');
    expect(typeof body.uptime).toBe('number');
  });

  test('GET /openapi.json returns valid OpenAPI 3.1 spec', async () => {
    const res = await fetch(`${baseUrl}/openapi.json`);
    expect(res.status).toBe(200);
    const spec = await res.json();
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBe('paws Control Plane API');
    expect(spec.paths).toBeDefined();
  });

  test('unauthenticated request returns 401', async () => {
    const res = await fetch(`${baseUrl}/v1/sessions`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  test('wrong token returns 401', async () => {
    const res = await fetch(`${baseUrl}/v1/sessions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-key' },
    });
    expect(res.status).toBe(401);
  });

  describe('sessions lifecycle', () => {
    let sessionId: string;

    test('POST /v1/sessions creates session', async () => {
      const res = await fetch(`${baseUrl}/v1/sessions`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          snapshot: 'test-snapshot',
          workload: { type: 'script', script: 'echo hi' },
        }),
      });
      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.sessionId).toBeDefined();
      expect(body.status).toBe('pending');
      sessionId = body.sessionId;
    });

    test('GET /v1/sessions/:id returns session', async () => {
      const res = await fetch(`${baseUrl}/v1/sessions/${sessionId}`, {
        headers: AUTH,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sessionId).toBe(sessionId);
    });

    test('DELETE /v1/sessions/:id cancels session', async () => {
      const res = await fetch(`${baseUrl}/v1/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: AUTH,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('cancelled');
    });

    test('GET /v1/sessions/:nonexistent returns 404', async () => {
      // Must be a valid UUID format for the route to match
      const res = await fetch(`${baseUrl}/v1/sessions/00000000-0000-0000-0000-000000000000`, {
        headers: AUTH,
      });
      expect(res.status).toBe(404);
    });
  });

  describe('daemons CRUD', () => {
    test('POST /v1/daemons creates daemon', async () => {
      const res = await fetch(`${baseUrl}/v1/daemons`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(DAEMON_BODY),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.role).toBe('test-daemon');
      expect(body.status).toBe('active');
    });

    test('GET /v1/daemons lists daemons', async () => {
      const res = await fetch(`${baseUrl}/v1/daemons`, {
        headers: AUTH,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.daemons).toHaveLength(1);
      expect(body.daemons[0].role).toBe('test-daemon');
    });

    test('GET /v1/daemons/:role returns specific daemon', async () => {
      const res = await fetch(`${baseUrl}/v1/daemons/test-daemon`, {
        headers: AUTH,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.role).toBe('test-daemon');
    });

    test('PATCH /v1/daemons/:role updates daemon', async () => {
      const res = await fetch(`${baseUrl}/v1/daemons/test-daemon`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ description: 'Updated description' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.description).toBe('Updated description');
    });

    test('DELETE /v1/daemons/:role removes daemon', async () => {
      const res = await fetch(`${baseUrl}/v1/daemons/test-daemon`, {
        method: 'DELETE',
        headers: AUTH,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('stopped');

      // Verify gone
      const getRes = await fetch(`${baseUrl}/v1/daemons/test-daemon`, {
        headers: AUTH,
      });
      expect(getRes.status).toBe(404);
    });
  });

  describe('fleet', () => {
    test('GET /v1/fleet returns overview', async () => {
      const res = await fetch(`${baseUrl}/v1/fleet`, {
        headers: AUTH,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.totalWorkers).toBe(1);
      expect(body.healthyWorkers).toBe(1);
      expect(body.totalCapacity).toBe(5);
    });

    test('GET /v1/fleet/workers returns worker list', async () => {
      const res = await fetch(`${baseUrl}/v1/fleet/workers`, {
        headers: AUTH,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.workers).toHaveLength(1);
    });
  });

  describe('snapshots', () => {
    test('GET /v1/snapshots returns empty list', async () => {
      const res = await fetch(`${baseUrl}/v1/snapshots`, {
        headers: AUTH,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.snapshots).toEqual([]);
    });

    test('POST /v1/snapshots/:id/build returns accepted', async () => {
      const res = await fetch(`${baseUrl}/v1/snapshots/test-snap/build`, {
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

  describe('webhooks', () => {
    test('POST /v1/webhooks/:role triggers daemon', async () => {
      // First create a daemon with webhook trigger
      await fetch(`${baseUrl}/v1/daemons`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          ...DAEMON_BODY,
          role: 'webhook-test',
        }),
      });

      // Trigger it via webhook (no auth required)
      const res = await fetch(`${baseUrl}/v1/webhooks/webhook-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test' }),
      });
      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.accepted).toBe(true);
      expect(body.sessionId).toBeDefined();
    });

    test('POST /v1/webhooks/:nonexistent returns 404', async () => {
      const res = await fetch(`${baseUrl}/v1/webhooks/nonexistent`, {
        method: 'POST',
      });
      expect(res.status).toBe(404);
    });
  });
});
