import { randomUUID } from 'node:crypto';

import { OpenAPIHono } from '@hono/zod-openapi';
import { selectWorker } from '@paws/scheduler';

import type { WorkerRegistry } from './discovery/registry.js';
import { createGovernanceChecker } from './governance.js';
import { createGatewayMetrics, type GatewayMetrics } from './metrics.js';
import { authMiddleware, type AuthConfig } from './middleware/auth.js';
import { createAuthRoutes } from './routes/auth.js';
import { registerWorkerWebSocket } from './routes/worker-ws.js';
import {
  createDaemonRoute,
  deleteDaemonRoute,
  getDaemonRoute,
  listDaemonsRoute,
  updateDaemonRoute,
} from './routes/daemons.js';
import { fleetOverviewRoute, listWorkersRoute } from './routes/fleet.js';
import { healthRoute } from './routes/health.js';
import {
  cancelSessionRoute,
  createSessionRoute,
  getSessionRoute,
  listSessionsRoute,
} from './routes/sessions.js';
import { buildSnapshotRoute, listSnapshotsRoute } from './routes/snapshots.js';
import { receiveWebhookRoute } from './routes/webhooks.js';
import { createDaemonStore, type DaemonStore } from './store/daemons.js';
import { createSessionStore, type SessionStore, type StoredSession } from './store/sessions.js';
import { createWorkerClient } from './worker-client.js';
import type { WorkerDiscovery } from './discovery/index.js';
import type { GovernanceChecker } from './governance.js';
import type { WorkerClient } from './worker-client.js';

export interface GatewayDeps {
  apiKey: string;
  /**
   * Multi-worker discovery — used when running in K8s or multi-node mode.
   * When provided, sessions are routed to the least-loaded healthy worker.
   */
  discovery?: WorkerDiscovery | undefined;
  /**
   * Single-worker client — kept for backward compatibility with local dev and
   * existing tests. If `discovery` is also provided, `workerClient` is ignored
   * for dispatch but still used as a fallback for the fleet health endpoints.
   *
   * @deprecated Prefer `discovery` + `createStaticDiscovery([workerUrl])`.
   */
  workerClient?: WorkerClient | undefined;
  sessionStore?: SessionStore | undefined;
  daemonStore?: DaemonStore | undefined;
  governance?: GovernanceChecker | undefined;
  /** Path to dashboard dist/ directory. When set, serves static files + SPA fallback. */
  dashboardDir?: string | undefined;
  /** OIDC config. When set, enables OIDC session auth alongside API key auth. */
  oidc?:
    | {
        issuer: string;
        clientId: string;
        clientSecret: string;
        redirectUri: string;
        authSecret: string;
        externalUrl?: string;
      }
    | undefined;
  /** Worker registry for call-home discovery. */
  workerRegistry?: WorkerRegistry | undefined;
  /** Bun WebSocket upgrader — needed for worker WS and session streaming. */
  upgradeWebSocket?: import('hono/ws').UpgradeWebSocket | undefined;
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
export async function createGatewayApp(deps: GatewayDeps) {
  const rawSessionStore = deps.sessionStore ?? createSessionStore();
  const daemonStore = deps.daemonStore ?? createDaemonStore();
  const governance = deps.governance ?? createGovernanceChecker();
  const { createSessionEvents } = await import('./events.js');
  const sessionEvents = createSessionEvents();

  // Metrics
  const metrics = createGatewayMetrics({
    sessionStore: rawSessionStore,
    daemonStore,
    registry: deps.workerRegistry,
  });

  // Wrap session store to emit events on status updates (for WebSocket streaming)
  const sessionStore: SessionStore = {
    ...rawSessionStore,
    updateStatus(sessionId, status, result) {
      rawSessionStore.updateStatus(sessionId, status, result);
      const session = rawSessionStore.get(sessionId);
      if (session) {
        sessionEvents.emit('update', sessionId, session);
      }
    },
  };

  // Resolve effective discovery:
  // 1. Use explicit discovery if provided.
  // 2. Wrap the legacy workerClient in a simple adapter so old code paths
  //    continue to work without changes.
  const discovery: WorkerDiscovery | null = deps.discovery ?? null;
  const legacyWorkerClient: WorkerClient | null = deps.workerClient ?? null;

  const oidcEnabled = !!deps.oidc;

  // If OIDC is configured, init the middleware with env vars so @hono/oidc-auth
  // can discover the provider and validate sessions.
  const app = new OpenAPIHono();

  if (deps.oidc) {
    const { initOidcAuthMiddleware } = await import('@hono/oidc-auth');
    app.use(
      '*',
      initOidcAuthMiddleware({
        OIDC_ISSUER: deps.oidc.issuer,
        OIDC_CLIENT_ID: deps.oidc.clientId,
        OIDC_CLIENT_SECRET: deps.oidc.clientSecret,
        OIDC_REDIRECT_URI: deps.oidc.redirectUri,
        OIDC_AUTH_SECRET: deps.oidc.authSecret,
        OIDC_AUTH_EXTERNAL_URL: deps.oidc.externalUrl,
      }),
    );
  }

  // --- Health (no auth) ---

  app.openapi(healthRoute, (c) => {
    return c.json({ status: 'healthy', uptime: Date.now() - startTime, version: '0.1.0' }, 200);
  });

  // --- Metrics (no auth — Prometheus scraper) ---

  app.get('/metrics', async (c) => {
    const metricsOutput = await metrics.promRegistry.metrics();
    return c.text(metricsOutput, 200, { 'Content-Type': 'text/plain; charset=utf-8' });
  });

  // --- Metrics query proxy (for dashboard charts) ---

  const VICTORIAMETRICS_URL = process.env['VICTORIAMETRICS_URL'] ?? 'http://localhost:8428';

  app.get('/v1/metrics/query', async (c) => {
    const query = c.req.query('query');
    const start = c.req.query('start');
    const end = c.req.query('end');
    const step = c.req.query('step');

    if (!query) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Missing query param' } }, 400);
    }

    try {
      const params = new URLSearchParams({ query });
      if (start && end) {
        if (step) params.set('step', step);
        params.set('start', start);
        params.set('end', end);
        const res = await fetch(`${VICTORIAMETRICS_URL}/api/v1/query_range?${params}`);
        return c.json(await res.json());
      }
      const res = await fetch(`${VICTORIAMETRICS_URL}/api/v1/query?${params}`);
      return c.json(await res.json());
    } catch {
      return c.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Metrics backend unreachable' } },
        502,
      );
    }
  });

  // --- HTTP request metrics middleware ---

  app.use('/v1/*', async (c, next) => {
    const start = Date.now();
    await next();
    metrics.recordRequest(c.req.method, c.req.path, c.res.status, Date.now() - start);
  });

  // --- Auth routes (login/callback/logout/me — no API key required) ---

  if (oidcEnabled) {
    app.route('/', createAuthRoutes());
  }

  // --- Auth middleware for all /v1 routes (except webhooks) ---

  const authConfig: AuthConfig = { apiKey: deps.apiKey, oidcEnabled };
  app.use('/v1/sessions', authMiddleware(authConfig));
  app.use('/v1/sessions/*', authMiddleware(authConfig));
  app.use('/v1/daemons/*', authMiddleware(authConfig));
  app.use('/v1/fleet/*', authMiddleware(authConfig));
  app.use('/v1/fleet', authMiddleware(authConfig));
  app.use('/v1/snapshots/*', authMiddleware(authConfig));
  app.use('/v1/snapshots', authMiddleware(authConfig));

  // --- Sessions ---

  app.openapi(createSessionRoute, async (c) => {
    const body = c.req.valid('json');
    const sessionId = randomUUID();
    sessionStore.create(sessionId, body);

    // Dispatch to worker (fire-and-forget)
    dispatchSession(discovery, legacyWorkerClient, sessionStore, sessionId, body);

    return c.json({ sessionId, status: 'pending' as const }, 202);
  });

  // Handler type assertion needed: z.unknown() output (null | undefined) doesn't satisfy Hono's JSONValue
  app.openapi(listSessionsRoute, (async (c: any) => {
    const { limit } = c.req.valid('query');
    const sessions = sessionStore.listAll(limit ?? 50).map(sessionToJson);
    return c.json({ sessions }, 200);
  }) as any);

  app.openapi(getSessionRoute, (async (c: any) => {
    const { id } = c.req.valid('param');
    const session = sessionStore.get(id as string);
    if (!session) {
      return c.json(
        { error: { code: 'SESSION_NOT_FOUND' as const, message: `Session ${id} not found` } },
        404,
      );
    }

    // If session is still pending/running, try to get latest status from the
    // worker that owns this session (recorded at dispatch time).
    if (session.status === 'pending' || session.status === 'running') {
      try {
        const workerClient = resolveWorkerClientForSession(session, legacyWorkerClient);
        if (workerClient) {
          const workerResult = await workerClient.getSession(id);
          if (workerResult) {
            const patch: Partial<StoredSession> = {};
            if (workerResult.exitCode !== undefined) patch.exitCode = workerResult.exitCode;
            if (workerResult.stdout !== undefined) patch.stdout = workerResult.stdout;
            if (workerResult.stderr !== undefined) patch.stderr = workerResult.stderr;
            if (workerResult.output !== undefined) patch.output = workerResult.output;
            if (workerResult.durationMs !== undefined) patch.durationMs = workerResult.durationMs;
            if (workerResult.completedAt !== undefined)
              patch.completedAt = workerResult.completedAt;
            if (workerResult.worker !== undefined) patch.worker = workerResult.worker;
            sessionStore.updateStatus(id, workerResult.status as StoredSession['status'], patch);
          }
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

    const sessionId = randomUUID();
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
    dispatchSession(discovery, legacyWorkerClient, sessionStore, sessionId, sessionRequest);

    return c.json({ accepted: true as const, sessionId }, 202);
  });

  // --- Fleet ---

  app.openapi(fleetOverviewRoute, async (c) => {
    const workers = await resolveAllWorkers(discovery, legacyWorkerClient);

    const totalWorkers = workers.length;
    const healthyWorkers = workers.filter((w) => w.status === 'healthy').length;
    const totalCapacity = workers.reduce((sum, w) => sum + w.capacity.maxConcurrent, 0);
    const usedCapacity = workers.reduce((sum, w) => sum + w.capacity.running, 0);
    const queuedSessions = workers.reduce((sum, w) => sum + w.capacity.queued, 0);

    return c.json(
      {
        totalWorkers,
        healthyWorkers,
        totalCapacity,
        usedCapacity,
        queuedSessions,
        activeDaemons: daemonStore.countActive(),
        activeSessions: sessionStore.countActiveSessions(),
      },
      200,
    );
  });

  app.openapi(listWorkersRoute, async (c) => {
    const workers = await resolveAllWorkers(discovery, legacyWorkerClient);
    return c.json({ workers }, 200);
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
        jobId: `build-${randomUUID().slice(0, 8)}`,
      },
      202,
    );
  });

  // --- WebSocket routes (require Bun runtime) ---

  if (deps.upgradeWebSocket) {
    // Worker call-home registration
    if (deps.workerRegistry) {
      registerWorkerWebSocket(app, deps.upgradeWebSocket, {
        apiKey: deps.apiKey,
        registry: deps.workerRegistry,
      });
    }

    // Session streaming (imported lazily to avoid circular deps)
    const { registerWebSocketRoutes } = await import('./routes/ws.js');
    registerWebSocketRoutes(app, deps.upgradeWebSocket, {
      apiKey: deps.apiKey,
      sessionStore,
      events: sessionEvents,
    });
  }

  // --- OpenAPI spec endpoint ---

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'paws Gateway API',
      version: '0.1.0',
      description: 'Self-hosted platform for running AI agents in isolated Firecracker microVMs',
    },
  });

  // --- Dashboard static files (opt-in) ---

  if (deps.dashboardDir) {
    const dir = deps.dashboardDir;
    // Serve static assets
    app.get('/assets/*', async (c) => {
      const path = c.req.path;
      const file = Bun.file(`${dir}${path}`);
      if (await file.exists()) {
        return new Response(file, {
          headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
        });
      }
      return c.notFound();
    });

    // SPA fallback: any non-API route serves index.html
    app.get('*', async (c) => {
      const path = c.req.path;
      // Skip API and known non-dashboard paths
      if (path.startsWith('/v1/') || path === '/health' || path === '/openapi.json') {
        return c.notFound();
      }
      // Try exact file first (favicon.ico, etc.)
      const exactFile = Bun.file(`${dir}${path}`);
      if (await exactFile.exists()) {
        return new Response(exactFile);
      }
      // SPA fallback
      const indexFile = Bun.file(`${dir}/index.html`);
      if (await indexFile.exists()) {
        return new Response(indexFile, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      return c.notFound();
    });
  }

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

// ---------------------------------------------------------------------------
// Dispatch helpers
// ---------------------------------------------------------------------------

/**
 * Fire-and-forget session dispatch.
 *
 * When `discovery` is provided, selects the least-loaded healthy worker via
 * the scheduler and dispatches there.  Falls back to `legacyWorkerClient`
 * when discovery is absent (single-node / test mode).
 *
 * If no healthy worker is available the session is immediately marked failed.
 */
function dispatchSession(
  discovery: WorkerDiscovery | null,
  legacyWorkerClient: WorkerClient | null,
  sessionStore: SessionStore,
  sessionId: string,
  request: Parameters<WorkerClient['createSession']>[1],
): void {
  sessionStore.updateStatus(sessionId, 'running', {
    startedAt: new Date().toISOString(),
  });

  void (async () => {
    try {
      if (discovery) {
        const workers = await discovery.getWorkers();
        const selected = selectWorker(workers);
        if (!selected) {
          sessionStore.updateStatus(sessionId, 'failed', {
            stderr: 'No healthy workers available',
            completedAt: new Date().toISOString(),
          });
          return;
        }
        // Derive a URL from the worker name. By convention, createStaticDiscovery
        // stores the base URL as the worker name when querying the health endpoint.
        // K8s discovery uses http://<podIP>:<port> as the worker name too.
        const workerUrl = selected.name;
        const client = createWorkerClient(workerUrl);
        await client.createSession(sessionId, request);
        // Record which worker owns this session for later getSession calls
        sessionStore.updateStatus(sessionId, 'running', { worker: selected.name });
      } else if (legacyWorkerClient) {
        await legacyWorkerClient.createSession(sessionId, request);
      } else {
        sessionStore.updateStatus(sessionId, 'failed', {
          stderr: 'No worker configured',
          completedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      sessionStore.updateStatus(sessionId, 'failed', {
        stderr: err instanceof Error ? err.message : String(err),
        completedAt: new Date().toISOString(),
      });
    }
  })();
}

/**
 * Resolve a WorkerClient for a session's owning worker.
 *
 * If the session has a recorded worker URL, create a client for it.
 * Otherwise fall back to the legacy single-worker client.
 */
function resolveWorkerClientForSession(
  session: StoredSession,
  legacyWorkerClient: WorkerClient | null,
): WorkerClient | null {
  if (session.worker) {
    // session.worker is the base URL stored at dispatch time
    return createWorkerClient(session.worker);
  }
  return legacyWorkerClient;
}

/**
 * Aggregate worker status from discovery or legacy client for fleet routes.
 */
async function resolveAllWorkers(
  discovery: WorkerDiscovery | null,
  legacyWorkerClient: WorkerClient | null,
): Promise<
  Array<{
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    capacity: { maxConcurrent: number; running: number; queued: number; available: number };
    snapshot: { id: string; version: number; ageMs: number };
    uptime: number;
  }>
> {
  if (discovery) {
    return discovery.getWorkers();
  }

  if (legacyWorkerClient) {
    try {
      const workerHealth = await legacyWorkerClient.health();
      return [
        {
          name: workerHealth.worker,
          status: workerHealth.status as 'healthy' | 'degraded' | 'unhealthy',
          capacity: workerHealth.capacity,
          snapshot: { id: 'default', version: 1, ageMs: 0 },
          uptime: workerHealth.uptime,
        },
      ];
    } catch {
      return [];
    }
  }

  return [];
}
