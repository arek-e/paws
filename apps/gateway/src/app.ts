import { OpenAPIHono } from '@hono/zod-openapi';

import { createGovernanceChecker } from './governance.js';
import { authMiddleware } from './middleware/auth.js';
import {
  createDaemonRoute,
  deleteDaemonRoute,
  getDaemonRoute,
  listDaemonsRoute,
  updateDaemonRoute,
} from './routes/daemons.js';
import { fleetOverviewRoute, listWorkersRoute } from './routes/fleet.js';
import { healthRoute } from './routes/health.js';
import { cancelSessionRoute, createSessionRoute, getSessionRoute } from './routes/sessions.js';
import { buildSnapshotRoute, listSnapshotsRoute } from './routes/snapshots.js';
import { receiveWebhookRoute } from './routes/webhooks.js';
import { createDaemonStore, type DaemonStore } from './store/daemons.js';
import { createSessionStore, type SessionStore, type StoredSession } from './store/sessions.js';
import type { GovernanceChecker } from './governance.js';
import type { WorkerClient } from './worker-client.js';

export interface GatewayDeps {
  apiKey: string;
  workerClient: WorkerClient;
  sessionStore?: SessionStore | undefined;
  daemonStore?: DaemonStore | undefined;
  governance?: GovernanceChecker | undefined;
}

const startTime = Date.now();

function daemonStats(d: {
  totalInvocations: number;
  lastInvokedAt?: string | undefined;
  totalDurationMs: number;
}) {
  return {
    totalInvocations: d.totalInvocations,
    lastInvokedAt: d.lastInvokedAt,
    avgDurationMs:
      d.totalInvocations > 0 ? Math.round(d.totalDurationMs / d.totalInvocations) : undefined,
  };
}

function sessionToJson(s: StoredSession) {
  return {
    sessionId: s.sessionId,
    status: s.status,
    ...(s.exitCode !== undefined && { exitCode: s.exitCode }),
    ...(s.stdout !== undefined && { stdout: s.stdout }),
    ...(s.stderr !== undefined && { stderr: s.stderr }),
    ...(s.output !== undefined && { output: s.output }),
    ...(s.startedAt !== undefined && { startedAt: s.startedAt }),
    ...(s.completedAt !== undefined && { completedAt: s.completedAt }),
    ...(s.durationMs !== undefined && { durationMs: s.durationMs }),
    ...(s.worker !== undefined && { worker: s.worker }),
    ...(s.metadata !== undefined && { metadata: s.metadata }),
  };
}

/** Create the gateway Hono OpenAPI app with all routes */
export function createGatewayApp(deps: GatewayDeps) {
  const sessionStore = deps.sessionStore ?? createSessionStore();
  const daemonStore = deps.daemonStore ?? createDaemonStore();
  const governance = deps.governance ?? createGovernanceChecker();
  const workerClient = deps.workerClient;

  const app = new OpenAPIHono();

  // --- Health (no auth) ---

  app.openapi(healthRoute, (c) => {
    return c.json({ status: 'healthy', uptime: Date.now() - startTime, version: '0.1.0' }, 200);
  });

  // --- Auth middleware for all /v1 routes (except webhooks) ---

  app.use('/v1/sessions/*', authMiddleware(deps.apiKey));
  app.use('/v1/daemons/*', authMiddleware(deps.apiKey));
  app.use('/v1/fleet/*', authMiddleware(deps.apiKey));
  app.use('/v1/fleet', authMiddleware(deps.apiKey));
  app.use('/v1/snapshots/*', authMiddleware(deps.apiKey));
  app.use('/v1/snapshots', authMiddleware(deps.apiKey));

  // --- Sessions ---

  app.openapi(createSessionRoute, async (c) => {
    const body = c.req.valid('json');
    const sessionId = crypto.randomUUID();
    sessionStore.create(sessionId, body);

    // Dispatch to worker (fire-and-forget)
    dispatchToWorker(workerClient, sessionStore, sessionId, body);

    return c.json({ sessionId, status: 'pending' as const }, 202);
  });

  // Handler type assertion needed: z.unknown() output (null | undefined) doesn't satisfy Hono's JSONValue
  app.openapi(getSessionRoute, (async (c: any) => {
    const { id } = c.req.valid('param');
    const session = sessionStore.get(id as string);
    if (!session) {
      return c.json(
        { error: { code: 'SESSION_NOT_FOUND' as const, message: `Session ${id} not found` } },
        404,
      );
    }

    // If session is still pending/running, try to get latest status from worker
    if (session.status === 'pending' || session.status === 'running') {
      try {
        const workerResult = await workerClient.getSession(id);
        if (workerResult) {
          const patch: Partial<StoredSession> = {};
          if (workerResult.exitCode !== undefined) patch.exitCode = workerResult.exitCode;
          if (workerResult.stdout !== undefined) patch.stdout = workerResult.stdout;
          if (workerResult.stderr !== undefined) patch.stderr = workerResult.stderr;
          if (workerResult.output !== undefined) patch.output = workerResult.output;
          if (workerResult.durationMs !== undefined) patch.durationMs = workerResult.durationMs;
          if (workerResult.completedAt !== undefined) patch.completedAt = workerResult.completedAt;
          if (workerResult.worker !== undefined) patch.worker = workerResult.worker;
          sessionStore.updateStatus(id, workerResult.status as StoredSession['status'], patch);
        }
      } catch {
        // Worker unreachable — return stale data
      }
    }

    return c.json(sessionToJson(sessionStore.get(id as string)!), 200);
  }) as any);

  app.openapi(cancelSessionRoute, (c) => {
    const { id } = c.req.valid('param');
    const session = sessionStore.get(id);
    if (!session) {
      return c.json(
        { error: { code: 'SESSION_NOT_FOUND' as const, message: `Session ${id} not found` } },
        404,
      );
    }

    sessionStore.updateStatus(id, 'cancelled');
    return c.json({ sessionId: id, status: 'cancelled' as const }, 200);
  });

  // --- Daemons ---

  app.openapi(createDaemonRoute, (c) => {
    const body = c.req.valid('json');
    if (daemonStore.get(body.role)) {
      return c.json(
        {
          error: {
            code: 'DAEMON_ALREADY_EXISTS' as const,
            message: `Daemon '${body.role}' already exists`,
          },
        },
        409,
      );
    }

    const daemon = daemonStore.create(body);
    return c.json(
      { role: daemon.role, status: 'active' as const, createdAt: daemon.createdAt },
      201,
    );
  });

  app.openapi(listDaemonsRoute, (c) => {
    const daemons = daemonStore.list().map((d) => ({
      role: d.role,
      description: d.description,
      status: d.status,
      trigger: d.trigger,
      stats: daemonStats(d.stats),
    }));
    return c.json({ daemons }, 200);
  });

  app.openapi(getDaemonRoute, (c) => {
    const { role } = c.req.valid('param');
    const daemon = daemonStore.get(role);
    if (!daemon) {
      return c.json(
        { error: { code: 'DAEMON_NOT_FOUND' as const, message: `Daemon '${role}' not found` } },
        404,
      );
    }

    const recentSessions = sessionStore.listByDaemon(role).map((s) => ({
      sessionId: s.sessionId,
      triggeredAt: s.startedAt ?? new Date().toISOString(),
      status: s.status,
      durationMs: s.durationMs,
    }));

    return c.json(
      {
        role: daemon.role,
        description: daemon.description,
        status: daemon.status,
        trigger: daemon.trigger,
        governance: daemon.governance,
        stats: daemonStats(daemon.stats),
        recentSessions,
      },
      200,
    );
  });

  app.openapi(updateDaemonRoute, (c) => {
    const { role } = c.req.valid('param');
    const daemon = daemonStore.get(role);
    if (!daemon) {
      return c.json(
        { error: { code: 'DAEMON_NOT_FOUND' as const, message: `Daemon '${role}' not found` } },
        404,
      );
    }

    const body = c.req.valid('json');
    // Build a clean patch without undefined values
    const patch: Record<string, unknown> = {};
    if (body.description !== undefined) patch['description'] = body.description;
    if (body.trigger !== undefined) patch['trigger'] = body.trigger;
    if (body.workload !== undefined) patch['workload'] = body.workload;
    if (body.resources !== undefined) patch['resources'] = body.resources;
    if (body.network !== undefined) patch['network'] = body.network;
    if (body.governance !== undefined) patch['governance'] = body.governance;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const updated = daemonStore.update(
      role,
      patch as Partial<import('./store/daemons.js').StoredDaemon>,
    )!;

    const recentSessions = sessionStore.listByDaemon(role).map((s) => ({
      sessionId: s.sessionId,
      triggeredAt: s.startedAt ?? new Date().toISOString(),
      status: s.status,
      durationMs: s.durationMs,
    }));

    return c.json(
      {
        role: updated.role,
        description: updated.description,
        status: updated.status,
        trigger: updated.trigger,
        governance: updated.governance,
        stats: daemonStats(updated.stats),
        recentSessions,
      },
      200,
    );
  });

  app.openapi(deleteDaemonRoute, (c) => {
    const { role } = c.req.valid('param');
    if (!daemonStore.delete(role)) {
      return c.json(
        { error: { code: 'DAEMON_NOT_FOUND' as const, message: `Daemon '${role}' not found` } },
        404,
      );
    }
    return c.json({ role, status: 'stopped' as const }, 200);
  });

  // --- Webhooks (no auth — validated by secret) ---

  app.openapi(receiveWebhookRoute, async (c) => {
    const { role } = c.req.valid('param');
    const daemon = daemonStore.get(role);
    if (!daemon) {
      return c.json(
        { error: { code: 'DAEMON_NOT_FOUND' as const, message: `Daemon '${role}' not found` } },
        404,
      );
    }

    if (daemon.trigger.type !== 'webhook') {
      return c.json(
        {
          error: {
            code: 'DAEMON_NOT_FOUND' as const,
            message: `Daemon '${role}' is not a webhook daemon`,
          },
        },
        404,
      );
    }

    // Check governance rate limit
    if (!governance.checkRateLimit(role, daemon.governance)) {
      return c.json(
        {
          error: {
            code: 'RATE_LIMITED' as const,
            message: `Daemon '${role}' rate limit exceeded`,
          },
        },
        429,
      );
    }

    // Create a session from the daemon config
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      payload = {};
    }

    const sessionId = crypto.randomUUID();
    const sessionRequest = {
      snapshot: daemon.snapshot,
      workload: {
        ...daemon.workload,
        env: {
          ...daemon.workload.env,
          TRIGGER_PAYLOAD: JSON.stringify(payload),
        },
      },
      resources: daemon.resources,
      timeoutMs: 600_000,
      network: daemon.network,
    };

    sessionStore.create(sessionId, sessionRequest, role);
    governance.recordAction(role);
    daemonStore.recordInvocation(role);

    // Dispatch to worker
    dispatchToWorker(workerClient, sessionStore, sessionId, sessionRequest);

    return c.json({ accepted: true as const, sessionId }, 202);
  });

  // --- Fleet ---

  app.openapi(fleetOverviewRoute, async (c) => {
    let workerHealth;
    try {
      workerHealth = await workerClient.health();
    } catch {
      workerHealth = null;
    }

    return c.json(
      {
        totalWorkers: workerHealth ? 1 : 0,
        healthyWorkers: workerHealth?.status === 'healthy' ? 1 : 0,
        totalCapacity: workerHealth ? workerHealth.capacity.maxConcurrent : 0,
        usedCapacity: workerHealth ? workerHealth.capacity.running : 0,
        queuedSessions: workerHealth ? workerHealth.capacity.queued : 0,
        activeDaemons: daemonStore.countActive(),
        activeSessions: sessionStore.countActiveSessions(),
      },
      200,
    );
  });

  app.openapi(listWorkersRoute, async (c) => {
    let workerHealth;
    try {
      workerHealth = await workerClient.health();
    } catch {
      return c.json({ workers: [] }, 200);
    }

    return c.json(
      {
        workers: [
          {
            name: workerHealth.worker,
            status: workerHealth.status as 'healthy' | 'degraded' | 'unhealthy',
            capacity: workerHealth.capacity,
            snapshot: { id: 'default', version: 1, ageMs: 0 },
            uptime: workerHealth.uptime,
          },
        ],
      },
      200,
    );
  });

  // --- Snapshots ---

  app.openapi(listSnapshotsRoute, (c) => {
    return c.json({ snapshots: [] }, 200);
  });

  app.openapi(buildSnapshotRoute, (c) => {
    const { id } = c.req.valid('param');
    c.req.valid('json'); // consume body for validation
    return c.json(
      {
        snapshotId: id,
        status: 'building' as const,
        jobId: `build-${crypto.randomUUID().slice(0, 8)}`,
      },
      202,
    );
  });

  // --- OpenAPI spec endpoint ---

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'paws Gateway API',
      version: '0.1.0',
      description: 'Self-hosted platform for running AI agents in isolated Firecracker microVMs',
    },
  });

  // --- Default validation error handler ---

  app.onError((err, c) => {
    if (err.message?.includes('Malformed JSON')) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } }, 400);
    }
    console.error('Unhandled error:', err);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
  });

  return app;
}

/** Fire-and-forget dispatch to worker, updating session store on completion */
function dispatchToWorker(
  workerClient: WorkerClient,
  sessionStore: SessionStore,
  sessionId: string,
  request: Parameters<WorkerClient['createSession']>[1],
) {
  sessionStore.updateStatus(sessionId, 'running', {
    startedAt: new Date().toISOString(),
  });

  workerClient.createSession(sessionId, request).catch((err) => {
    sessionStore.updateStatus(sessionId, 'failed', {
      stderr: err instanceof Error ? err.message : String(err),
      completedAt: new Date().toISOString(),
    });
  });
}
