import { randomUUID } from 'node:crypto';

import { OpenAPIHono } from '@hono/zod-openapi';
import { createLogger } from '@paws/logger';
import type { Hono } from 'hono';
import {
  verifyWebhookSignature,
  parseWebhookEvent,
  matchDaemon,
  createGitHubAuth,
  postComment,
  buildManifest,
  exchangeManifestCode,
  saveCredentials,
  loadCredentials,
} from '@paws/integrations';
import type { GitHubDaemon } from '@paws/integrations';
import {
  listAuditRoute,
  auditStatsRoute,
  createAuditStore,
  type AuditStore,
} from '@paws/domain-audit';
import { browserActionRoute, browserScreenshotRoute } from '@paws/domain-browser';
import {
  createDaemonRoute,
  deleteDaemonRoute,
  getDaemonRoute,
  listDaemonsRoute,
  updateDaemonRoute,
  receiveWebhookRoute,
  createDaemonStore,
  type DaemonStore,
} from '@paws/domain-daemon';
import { createGovernanceChecker } from '@paws/domain-policy';
import {
  selectWorker,
  costSummaryRoute,
  fleetOverviewRoute,
  listWorkersRoute,
} from '@paws/domain-fleet';
import { createMcpServerStore } from '@paws/domain-mcp';
import {
  cancelSessionRoute,
  createSessionRoute,
  getSessionRoute,
  listSessionsRoute,
  createSessionStore,
  createSessionEvents,
  type SessionStore,
  type StoredSession,
} from '@paws/domain-session';
import {
  buildSnapshotRoute,
  listSnapshotsRoute,
  createSnapshotConfigRoute,
  deleteSnapshotConfigRoute,
  getSnapshotConfigRoute,
  listSnapshotConfigsRoute,
  updateSnapshotConfigRoute,
  listTemplatesRoute,
  getTemplateRoute,
  deployTemplateRoute,
} from '@paws/domain-snapshot';

import type { WorkerRegistry } from './discovery/registry.js';
import { createBuildStore, createSqliteBuildStore } from './store/builds.js';
import { createControlPlaneMetrics } from './metrics.js';
import { authMiddleware, type AuthConfig } from './middleware/auth.js';
import { createAuthRoutes } from './routes/auth.js';
import { registerWorkerWebSocket } from './routes/worker-ws.js';
import { healthRoute } from './routes/health.js';
import { createMcpRoutes } from './routes/mcp.js';
import { createServerRoutes } from './routes/servers.js';
import { createSqliteDaemonStore } from './store/daemons.js';
import { createTemplateStore } from './store/templates.js';
import {
  createSnapshotConfigStore,
  createSqliteSnapshotConfigStore,
} from './store/snapshot-configs.js';
import { createSqliteSessionStore } from './store/sessions.js';
import { createProvisioningRoutes } from './routes/provisioning.js';
import { createSetupRoutes } from './routes/setup.js';
import { createServerStore, createSqliteServerStore, type ServerStore } from './store/servers.js';
import { createWorkerClient } from './worker-client.js';
import type { CredentialStore } from '@paws/credentials';
import type { PawsDatabase } from './db/index.js';
import type { WorkerDiscovery } from './discovery/index.js';
import type { GovernanceChecker } from '@paws/domain-policy';
import type { WorkerClient } from './worker-client.js';

export interface ControlPlaneDeps {
  apiKey: string;
  /** SQLite database instance. When provided, stores use SQLite instead of in-memory. */
  db?: PawsDatabase | undefined;
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
  /** Server store for setup wizard. */
  serverStore?: ServerStore | undefined;
  /** Credential store for setup wizard. */
  credentialStore?: CredentialStore | undefined;
  /** Worker registry for call-home discovery. */
  workerRegistry?: WorkerRegistry | undefined;
  /** Audit store. Defaults to file-backed at DATA_DIR/audit.json, falls back to in-memory. */
  auditStore?: AuditStore | undefined;
  /** Bun WebSocket upgrader — needed for worker WS and session streaming. */
  upgradeWebSocket?: import('hono/ws').UpgradeWebSocket | undefined;
}

const startTime = Date.now();

function daemonStats(d: {
  totalInvocations: number;
  lastInvokedAt?: string | undefined;
  totalDurationMs: number;
  totalVcpuSeconds: number;
}) {
  return {
    totalInvocations: d.totalInvocations,
    lastInvokedAt: d.lastInvokedAt,
    avgDurationMs:
      d.totalInvocations > 0 ? Math.round(d.totalDurationMs / d.totalInvocations) : undefined,
    totalVcpuSeconds: d.totalVcpuSeconds,
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
    ...(s.resources !== undefined && { resources: s.resources }),
    ...(s.vcpuSeconds !== undefined && { vcpuSeconds: s.vcpuSeconds }),
    ...(s.browser !== undefined && { browser: s.browser }),
    ...(s.exposedPorts !== undefined && { exposedPorts: s.exposedPorts }),
  };
}

/** Create the gateway Hono OpenAPI app with all routes */
export async function createControlPlaneApp(deps: ControlPlaneDeps) {
  const rawSessionStore =
    deps.sessionStore ?? (deps.db ? createSqliteSessionStore(deps.db) : createSessionStore());
  const daemonStore =
    deps.daemonStore ?? (deps.db ? createSqliteDaemonStore(deps.db) : createDaemonStore());
  const governance = deps.governance ?? createGovernanceChecker();
  const sessionEvents = createSessionEvents();

  // Audit log — injectable for tests, file-backed in production.
  // Only use file-backed store when DATA_DIR is explicitly set; otherwise in-memory.
  const auditStore =
    deps.auditStore ??
    (() => {
      const dataDir = process.env['DATA_DIR'];
      return dataDir ? createAuditStore(`${dataDir}/audit.json`) : createAuditStore();
    })();

  // Metrics
  const metrics = createControlPlaneMetrics({
    sessionStore: rawSessionStore,
    daemonStore,
    registry: deps.workerRegistry,
  });

  // Wrap session store to emit events + record metrics on status updates
  const sessionStore: SessionStore = {
    ...rawSessionStore,
    updateStatus(sessionId, status, result) {
      rawSessionStore.updateStatus(sessionId, status, result);
      const session = rawSessionStore.get(sessionId);
      if (session) {
        sessionEvents.emit('update', sessionId, session);

        // Record metrics + daemon cost + audit on terminal states
        const terminal = ['completed', 'failed', 'timeout', 'cancelled'];
        if (terminal.includes(status)) {
          auditStore.append({
            category: 'session',
            action: `session.${status}`,
            severity: status === 'completed' ? 'info' : status === 'cancelled' ? 'warn' : 'error',
            resourceType: 'session',
            resourceId: sessionId,
            details: {
              durationMs: session.durationMs,
              worker: session.worker,
              daemonRole: session.daemonRole,
            },
          });
          metrics.recordSession(
            status,
            session.durationMs,
            session.vcpuSeconds,
            session.daemonRole,
          );
          // Accumulate cost on the daemon (invocation count already incremented at trigger time)
          if (session.daemonRole && session.vcpuSeconds) {
            const daemon = daemonStore.get(session.daemonRole);
            if (daemon) {
              daemonStore.update(session.daemonRole, {
                stats: {
                  ...daemon.stats,
                  totalVcpuSeconds: daemon.stats.totalVcpuSeconds + session.vcpuSeconds,
                },
              });
            }
          }
        }
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
        ...(deps.oidc.externalUrl ? { OIDC_AUTH_EXTERNAL_URL: deps.oidc.externalUrl } : {}),
      }),
    );
  }

  // --- Health (no auth) ---

  app.openapi(healthRoute, (c) => {
    return c.json(
      {
        status: 'healthy',
        uptime: Date.now() - startTime,
        version: process.env['PAWS_VERSION'] ?? '0.0.0',
      },
      200,
    );
  });

  // --- Version manifest (no auth) ---

  app.get('/version', (c) => {
    return c.json({
      version: process.env['PAWS_VERSION'] ?? '0.0.0',
      commit: process.env['PAWS_COMMIT'] ?? 'unknown',
      buildDate: process.env['PAWS_BUILD_DATE'] ?? 'unknown',
      node: process.version,
      runtime: 'bun',
    });
  });

  // --- Database + Password auth ---

  let db = deps.db;
  if (!db) {
    try {
      const { createDatabase } = await import('./db/index.js');
      const dataDir = process.env['DATA_DIR'] ?? '/var/lib/paws/data';
      db = createDatabase(`${dataDir}/paws.db`);
    } catch {
      // bun:sqlite not available (e.g. running under vitest/Node.js) — DB features disabled
    }
  }

  // Password auth (requires DB)
  let passwordAuth: import('./auth/password.js').PasswordAuth | null = null;
  if (db) {
    const { createPasswordAuth } = await import('./auth/password.js');
    passwordAuth = createPasswordAuth(db);
  }

  // Setup status — no auth, dashboard checks this on load
  app.get('/v1/setup/status', (c) => {
    const isFirstRun = passwordAuth?.isFirstRun() ?? true;
    const hasAnySetup = daemonStore.list().length > 0 || sessionStore.listAll(1).length > 0;
    return c.json({
      needsAccount: isFirstRun,
      needsOnboarding: !isFirstRun && !hasAnySetup,
      oidcAvailable: oidcEnabled,
    });
  });

  // Create admin account (first run only)
  app.post('/auth/setup', async (c) => {
    if (!passwordAuth) {
      return c.json({ error: { code: 'DB_UNAVAILABLE', message: 'Database not available' } }, 503);
    }
    if (!passwordAuth.isFirstRun()) {
      return c.json(
        { error: { code: 'ALREADY_SETUP', message: 'Admin account already exists' } },
        409,
      );
    }

    const body = await c.req.json<{ email: string; password: string }>().catch(() => null);
    if (!body?.email || !body?.password) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Email and password required' } },
        400,
      );
    }
    if (body.password.length < 8) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' } },
        400,
      );
    }

    const token = await passwordAuth!.createAdmin(body.email, body.password);
    if (!token) {
      return c.json({ error: { code: 'SETUP_FAILED', message: 'Failed to create admin' } }, 500);
    }

    auditStore.append({
      category: 'auth',
      action: 'auth.account_created',
      actor: body.email,
      severity: 'info',
      details: { email: body.email },
    });

    // Set session cookie
    c.header(
      'Set-Cookie',
      `paws_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
    );
    return c.json({ email: body.email, status: 'created' }, 201);
  });

  // Password login
  app.post('/auth/password-login', async (c) => {
    const body = await c.req.json<{ email: string; password: string }>().catch(() => null);
    if (!body?.email || !body?.password) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Email and password required' } },
        400,
      );
    }

    const token = passwordAuth ? await passwordAuth.login(body.email, body.password) : null;
    if (!token) {
      auditStore.append({
        category: 'auth',
        action: 'auth.login_failed',
        actor: body.email,
        severity: 'warn',
        details: { email: body.email, reason: 'invalid_credentials' },
      });
      return c.json(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
        401,
      );
    }

    auditStore.append({
      category: 'auth',
      action: 'auth.login',
      actor: body.email,
      severity: 'info',
      details: { email: body.email },
    });

    c.header(
      'Set-Cookie',
      `paws_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
    );
    return c.json({ email: body.email, status: 'authenticated' });
  });

  // Check session (from cookie)
  app.get('/auth/session', (c) => {
    const cookies = c.req.header('cookie') ?? '';
    const match = cookies.match(/paws_session=([^;]+)/);
    if (!match) {
      return c.json({ authenticated: false }, 401);
    }

    const sessionToken = match[1];
    if (!sessionToken) {
      return c.json({ authenticated: false }, 401);
    }

    const session = passwordAuth?.validateSession(sessionToken);
    if (!session) {
      return c.json({ authenticated: false }, 401);
    }

    return c.json({ authenticated: true, email: session.email });
  });

  // Password logout
  app.post('/auth/password-logout', (c) => {
    const cookies = c.req.header('cookie') ?? '';
    const match = cookies.match(/paws_session=([^;]+)/);
    const logoutToken = match?.[1];
    if (logoutToken && passwordAuth) {
      // Get email before deleting session
      const session = passwordAuth.validateSession(logoutToken);
      passwordAuth.logout(logoutToken);
      auditStore.append({
        category: 'auth',
        action: 'auth.logout',
        actor: session?.email ?? 'unknown',
        severity: 'info',
      });
    }
    c.header('Set-Cookie', 'paws_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return c.json({ status: 'logged_out' });
  });

  // --- Version (no auth — workers and dashboard check this) ---

  const { createVersionChecker } = await import('./version-checker.js');
  const versionChecker = createVersionChecker(process.env['PAWS_VERSION'] ?? '0.0.0');

  app.get('/v1/version', (c) => {
    return c.json(versionChecker.getInfo());
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

  const authConfig: AuthConfig = {
    apiKey: deps.apiKey,
    oidcEnabled,
    ...(passwordAuth ? { passwordAuth } : {}),
  };
  app.use('/v1/sessions', authMiddleware(authConfig));
  app.use('/v1/sessions/*', authMiddleware(authConfig));
  app.use('/v1/daemons/*', authMiddleware(authConfig));
  app.use('/v1/fleet/*', authMiddleware(authConfig));
  app.use('/v1/fleet', authMiddleware(authConfig));
  app.use('/v1/snapshots/*', authMiddleware(authConfig));
  app.use('/v1/snapshots', authMiddleware(authConfig));
  app.use('/v1/snapshot-configs/*', authMiddleware(authConfig));
  app.use('/v1/snapshot-configs', authMiddleware(authConfig));
  app.use('/v1/setup/*', authMiddleware(authConfig));
  app.use('/v1/setup', authMiddleware(authConfig));
  app.use('/v1/servers', authMiddleware(authConfig));
  app.use('/v1/servers/*', authMiddleware(authConfig));
  app.use('/v1/provisioning', authMiddleware(authConfig));
  app.use('/v1/provisioning/*', authMiddleware(authConfig));
  app.use('/v1/templates', authMiddleware(authConfig));
  app.use('/v1/templates/*', authMiddleware(authConfig));
  app.use('/v1/audit/*', authMiddleware(authConfig));
  app.use('/v1/audit', authMiddleware(authConfig));
  app.use('/v1/mcp/*', authMiddleware(authConfig));
  app.use('/v1/mcp', authMiddleware(authConfig));
  app.use('/v1/settings', authMiddleware(authConfig));
  app.use('/v1/settings/*', authMiddleware(authConfig));

  // Snapshot config store — hoisted so mergeSnapshotDomains can use it in session dispatch
  const snapshotConfigStore = deps.db
    ? createSqliteSnapshotConfigStore(deps.db)
    : createSnapshotConfigStore();
  const serverStore =
    deps.serverStore ?? (deps.db ? createSqliteServerStore(deps.db) : createServerStore());

  // --- Sessions ---

  /** Merge snapshot config's requiredDomains into session network allowOut */
  function mergeSnapshotDomains(
    request: Parameters<typeof dispatchSession>[4],
  ): Parameters<typeof dispatchSession>[4] {
    const config = snapshotConfigStore.get(request.snapshot);
    if (!config?.requiredDomains?.length) return request;

    const existingAllowOut = request.network?.allowOut ?? [];
    const merged = [...new Set([...existingAllowOut, ...config.requiredDomains])];
    return {
      ...request,
      network: {
        ...request.network,
        allowOut: merged,
        credentials: request.network?.credentials ?? {},
        expose: request.network?.expose ?? [],
      },
    };
  }

  app.openapi(createSessionRoute, async (c) => {
    const body = c.req.valid('json');
    const sessionId = randomUUID();
    sessionStore.create(sessionId, body);

    auditStore.append({
      category: 'session',
      action: 'session.created',
      severity: 'info',
      resourceType: 'session',
      resourceId: sessionId,
      details: { snapshot: body.snapshot },
    });

    // Merge snapshot requiredDomains into network allowOut before dispatch
    const enriched = mergeSnapshotDomains(body);

    // Auto-inject credentials from store for allowlisted domains, then resolve $REFERENCES
    if (enriched.network) {
      try {
        enriched.network.credentials = await credentialResolver.autoInject(
          enriched.network.allowOut ?? [],
          enriched.network.credentials ?? {},
        );
        enriched.network.credentials = await credentialResolver.resolveCredentials(
          enriched.network.credentials,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Credential resolution failed';
        sessionStore.updateStatus(sessionId, 'failed', {
          exitCode: 1,
          stdout: '',
          stderr: message,
        });
        return c.json({ error: { code: 'VALIDATION_ERROR' as const, message } }, 400);
      }
    }

    dispatchSession(discovery, legacyWorkerClient, sessionStore, sessionId, enriched);

    return c.json({ sessionId, status: 'pending' as const }, 202);
  });

  // Handler type assertion needed: z.unknown() output (null | undefined) doesn't satisfy Hono's JSONValue
  // eslint-disable-next-line typescript/no-explicit-any -- Hono OpenAPI handler type mismatch with z.unknown()
  app.openapi(listSessionsRoute, (async (c: any) => {
    const { limit } = c.req.valid('query');
    const sessions = sessionStore.listAll(limit ?? 50).map(sessionToJson);
    return c.json({ sessions }, 200);
    // eslint-disable-next-line typescript/no-explicit-any
  }) as any);

  // eslint-disable-next-line typescript/no-explicit-any -- Hono OpenAPI handler type mismatch with z.unknown()
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
            if (workerResult.exposedPorts !== undefined)
              patch.exposedPorts = workerResult.exposedPorts;
            sessionStore.updateStatus(id, workerResult.status as StoredSession['status'], patch);
          }
        }
      } catch {
        // Worker unreachable — return stale data
      }
    }

    return c.json(sessionToJson(sessionStore.get(id as string)!), 200);
    // eslint-disable-next-line typescript/no-explicit-any
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
    auditStore.append({
      category: 'session',
      action: 'session.cancelled',
      severity: 'warn',
      resourceType: 'session',
      resourceId: id,
    });
    return c.json({ sessionId: id, status: 'cancelled' as const }, 200);
  });

  // --- Browser (computer-use) ---

  // eslint-disable-next-line typescript/no-explicit-any -- Hono OpenAPI handler type mismatch
  app.openapi(browserActionRoute, (async (c: any) => {
    const { id } = c.req.valid('param');
    const session = sessionStore.get(id as string);
    if (!session) {
      return c.json(
        { error: { code: 'SESSION_NOT_FOUND' as const, message: `Session ${id} not found` } },
        404,
      );
    }
    if (!session.browser?.enabled) {
      return c.json(
        {
          error: {
            code: 'BROWSER_NOT_ENABLED' as const,
            message: 'Browser/computer-use is not enabled for this session',
          },
        },
        400,
      );
    }

    const action = c.req.valid('json');

    // Proxy to worker — find which worker owns this session
    const workerUrl = session.worker;
    if (!workerUrl) {
      return c.json(
        {
          error: {
            code: 'SESSION_NOT_DISPATCHED' as const,
            message: 'Session has not been dispatched to a worker yet',
          },
        },
        400,
      );
    }

    try {
      const res = await fetch(`${workerUrl}/v1/sessions/${id}/browser/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      });
      const body = await res.json();
      return c.json(body, res.status as 200);
    } catch {
      // Worker unreachable — return stub response
      return c.json({ success: false, error: 'Worker unreachable' }, 200);
    }
    // eslint-disable-next-line typescript/no-explicit-any
  }) as any);

  // eslint-disable-next-line typescript/no-explicit-any -- Hono OpenAPI handler type mismatch
  app.openapi(browserScreenshotRoute, (async (c: any) => {
    const { id } = c.req.valid('param');
    const session = sessionStore.get(id as string);
    if (!session) {
      return c.json(
        { error: { code: 'SESSION_NOT_FOUND' as const, message: `Session ${id} not found` } },
        404,
      );
    }
    if (!session.browser?.enabled) {
      return c.json(
        {
          error: {
            code: 'BROWSER_NOT_ENABLED' as const,
            message: 'Browser/computer-use is not enabled for this session',
          },
        },
        400,
      );
    }

    const workerUrl = session.worker;
    if (!workerUrl) {
      return c.json(
        {
          error: {
            code: 'SESSION_NOT_DISPATCHED' as const,
            message: 'Session has not been dispatched to a worker yet',
          },
        },
        400,
      );
    }

    try {
      const res = await fetch(`${workerUrl}/v1/sessions/${id}/browser/screenshot`);
      const body = await res.json();
      return c.json(body, res.status as 200);
    } catch {
      // Worker unreachable — return placeholder
      return c.json(
        {
          image: '',
          width: session.browser.width ?? 1280,
          height: session.browser.height ?? 720,
          timestamp: new Date().toISOString(),
        },
        200,
      );
    }
    // eslint-disable-next-line typescript/no-explicit-any
  }) as any);

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
    auditStore.append({
      category: 'daemon',
      action: 'daemon.created',
      severity: 'info',
      resourceType: 'daemon',
      resourceId: daemon.role,
    });
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
    auditStore.append({
      category: 'daemon',
      action: 'daemon.updated',
      severity: 'info',
      resourceType: 'daemon',
      resourceId: role,
    });

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
    auditStore.append({
      category: 'daemon',
      action: 'daemon.deleted',
      severity: 'warn',
      resourceType: 'daemon',
      resourceId: role,
    });
    return c.json({ role, status: 'stopped' as const }, 200);
  });

  // --- Templates ---

  const templateStore = createTemplateStore();

  /** Serialize a template for JSON response (strip undefined values from defaults) */
  function templateToJson(t: import('./store/templates.js').DaemonTemplate) {
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      icon: t.icon,
      defaults: JSON.parse(JSON.stringify(t.defaults)) as Record<string, unknown>,
    };
  }

  app.openapi(listTemplatesRoute, (c) => {
    const { category } = c.req.valid('query');
    const templates = templateStore.list(category).map(templateToJson);
    return c.json({ templates }, 200);
  });

  app.openapi(getTemplateRoute, (c) => {
    const { id } = c.req.valid('param');
    const template = templateStore.get(id);
    if (!template) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND' as const,
            message: `Template '${id}' not found`,
          },
        },
        404,
      );
    }
    return c.json(templateToJson(template), 200);
  });

  app.openapi(deployTemplateRoute, (c) => {
    const { id } = c.req.valid('param');
    const template = templateStore.get(id);
    if (!template) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND' as const,
            message: `Template '${id}' not found`,
          },
        },
        404,
      );
    }

    const body = c.req.valid('json');
    const role = body.role ?? template.defaults.role ?? template.id;
    const snapshot = body.snapshot ?? template.defaults.snapshot ?? 'agent-default';

    if (daemonStore.get(role)) {
      return c.json(
        {
          error: {
            code: 'DAEMON_ALREADY_EXISTS' as const,
            message: `Daemon '${role}' already exists`,
          },
        },
        409,
      );
    }

    // Merge template defaults with overrides
    const merged = {
      ...template.defaults,
      ...body.overrides,
      role,
      snapshot,
    } as import('@paws/domain-daemon').CreateDaemonRequest;

    const daemon = daemonStore.create(merged);
    return c.json(
      {
        role: daemon.role,
        status: 'active' as const,
        createdAt: daemon.createdAt,
        templateId: id,
      },
      201,
    );
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
      auditStore.append({
        category: 'daemon',
        action: 'governance.rate_limited',
        severity: 'warn',
        resourceType: 'daemon',
        resourceId: role,
      });
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

    // Generate workload from agent config or use the explicit workload
    let workload;
    if (daemon.agent) {
      const { generateAgentScript } = await import('@paws/domain-agent');
      workload = {
        type: 'script' as const,
        script: generateAgentScript(daemon.agent),
        env: { TRIGGER_PAYLOAD: JSON.stringify(payload) },
      };
    } else if (daemon.workload) {
      workload = {
        ...daemon.workload,
        env: {
          ...daemon.workload.env,
          TRIGGER_PAYLOAD: JSON.stringify(payload),
        },
      };
    } else {
      createLogger('daemon').error('No workload or agent configured', { role });
      return c.json(
        {
          error: {
            code: 'INTERNAL_ERROR' as const,
            message: 'No workload or agent configured',
          },
        },
        500,
      );
    }

    const sessionRequest = {
      snapshot: daemon.snapshot,
      workload,
      resources: daemon.resources,
      timeoutMs: 600_000,
      network: daemon.network,
    };

    sessionStore.create(sessionId, sessionRequest, role);
    governance.recordAction(role);
    daemonStore.recordInvocation(role);
    auditStore.append({
      category: 'daemon',
      action: 'daemon.triggered',
      severity: 'info',
      resourceType: 'daemon',
      resourceId: role,
      details: { sessionId },
    });

    // Dispatch to worker
    dispatchSession(discovery, legacyWorkerClient, sessionStore, sessionId, sessionRequest);

    return c.json({ accepted: true as const, sessionId }, 202);
  });

  // --- GitHub App manifest flow (setup) ---

  const externalUrl = deps.oidc?.externalUrl ?? `http://localhost:${process.env['PORT'] ?? 4000}`;

  // GET /setup/github/manifest — returns the manifest JSON for the dashboard form
  app.get('/setup/github/manifest', (c) => {
    const manifest = buildManifest(externalUrl);
    return c.json(manifest);
  });

  // GET /setup/github/callback — handles redirect from GitHub after app creation
  app.get('/setup/github/callback', async (c) => {
    const code = c.req.query('code');
    if (!code) {
      return c.json({ error: { code: 'MISSING_CODE', message: 'No code parameter' } }, 400);
    }

    try {
      const creds = await exchangeManifestCode(code);
      saveCredentials(creds);
      // Redirect to dashboard with success
      return c.redirect('/setup?github=connected');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: { code: 'EXCHANGE_FAILED', message } }, 500);
    }
  });

  // GET /setup/github/status — check if GitHub App is connected
  app.get('/setup/github/status', (c) => {
    const creds = loadCredentials();
    if (creds) {
      return c.json({
        connected: true,
        appSlug: creds.appSlug,
        appId: creds.appId,
        htmlUrl: creds.htmlUrl,
        createdAt: creds.createdAt,
      });
    }
    return c.json({ connected: false });
  });

  // GET /setup/github/installations — list all installations of the GitHub App
  app.get('/setup/github/installations', async (c) => {
    const creds = loadCredentials();
    if (!creds) {
      return c.json({ installations: [], installUrl: null });
    }

    try {
      const auth = createGitHubAuth(creds.appId, creds.privateKey);
      const installations = await auth.listInstallations();
      return c.json({
        installations,
        installUrl: `https://github.com/apps/${creds.appSlug}/installations/new`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: { code: 'GITHUB_API_ERROR', message } }, 502);
    }
  });

  // GET /setup/github/installations/:id/repos — list repos for a specific installation
  app.get('/setup/github/installations/:id/repos', async (c) => {
    const creds = loadCredentials();
    if (!creds) {
      return c.json({ repos: [] });
    }

    const installationId = Number(c.req.param('id'));
    if (!installationId || Number.isNaN(installationId)) {
      return c.json({ error: { code: 'INVALID_ID', message: 'Invalid installation ID' } }, 400);
    }

    try {
      const auth = createGitHubAuth(creds.appId, creds.privateKey);
      const repos = await auth.listInstallationRepos(installationId);
      return c.json({ repos });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: { code: 'GITHUB_API_ERROR', message } }, 502);
    }
  });

  // GET /setup/github/repos — flat list of all repos across all installations
  app.get('/setup/github/repos', async (c) => {
    const creds = loadCredentials();
    if (!creds) {
      return c.json({ repos: [] });
    }

    try {
      const auth = createGitHubAuth(creds.appId, creds.privateKey);
      const installations = await auth.listInstallations();
      const allRepos: Array<{
        fullName: string;
        private: boolean;
        htmlUrl: string;
        installationId: number;
      }> = [];

      for (const inst of installations) {
        const repos = await auth.listInstallationRepos(inst.id);
        for (const repo of repos) {
          allRepos.push({
            fullName: repo.fullName,
            private: repo.private,
            htmlUrl: repo.htmlUrl,
            installationId: inst.id,
          });
        }
      }

      return c.json({ repos: allRepos });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: { code: 'GITHUB_API_ERROR', message } }, 502);
    }
  });

  // --- GitHub App webhooks (no auth — validated by HMAC signature) ---

  // Load credentials from file (manifest flow) or env vars (manual setup)
  const savedCreds = loadCredentials();
  const githubWebhookSecret = savedCreds?.webhookSecret ?? process.env['GITHUB_WEBHOOK_SECRET'];
  const githubAppId = savedCreds?.appId ?? process.env['GITHUB_APP_ID'];
  const githubPrivateKey = savedCreds?.privateKey ?? process.env['GITHUB_APP_PRIVATE_KEY'];

  if (githubWebhookSecret && githubAppId && githubPrivateKey) {
    const githubAuth = createGitHubAuth(githubAppId, githubPrivateKey);

    app.post('/webhooks/github', async (c) => {
      // Verify HMAC signature
      const signature = c.req.header('x-hub-signature-256');
      const rawBody = await c.req.text();
      if (!signature || !verifyWebhookSignature(rawBody, signature, githubWebhookSecret)) {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid signature' } }, 401);
      }

      const payload = JSON.parse(rawBody) as Record<string, unknown>;
      const event = parseWebhookEvent(payload);
      if (!event) {
        // Not a @paws mention, ignore silently
        return c.json({ ignored: true }, 200);
      }

      // Find matching daemon
      const githubDaemons = daemonStore
        .list()
        .filter((d): d is GitHubDaemon & typeof d => d.trigger.type === 'github') as GitHubDaemon[];
      const match = matchDaemon(event, githubDaemons);

      if (!match) {
        // Post a helpful comment
        await postComment(
          { auth: githubAuth },
          event.installationId,
          event.issueUrl,
          `No daemon configured for \`@paws ${event.command}\` in this repo.`,
        ).catch(() => {}); // best-effort
        return c.json({ error: { code: 'NO_MATCH', message: 'No daemon matches' } }, 200);
      }

      const { daemon } = match;

      // Check governance (daemon from store has proper governance type)
      const fullDaemon = daemonStore.get(daemon.role);
      if (fullDaemon && !governance.checkRateLimit(daemon.role, fullDaemon.governance)) {
        await postComment(
          { auth: githubAuth },
          event.installationId,
          event.issueUrl,
          `Rate limit exceeded for \`@paws ${event.command}\`. Try again later.`,
        ).catch(() => {});
        return c.json({ error: { code: 'RATE_LIMITED', message: 'Rate limited' } }, 429);
      }

      // Acknowledge quickly
      await postComment(
        { auth: githubAuth },
        event.installationId,
        event.issueUrl,
        `Running \`${event.command}\`... I'll post results when done.`,
      ).catch(() => {});

      // Create session with GitHub metadata
      const sessionId = randomUUID();
      // Build session request from daemon config (use fullDaemon for proper types)
      const src = fullDaemon ?? daemon;
      if (!src.workload) {
        return c.json(
          { error: { code: 'DAEMON_MISCONFIGURED', message: 'No workload configured' } },
          500,
        );
      }
      const sessionRequest = {
        snapshot: src.snapshot,
        workload: {
          type: 'script' as const,
          script: src.workload.script,
          env: {
            ...src.workload.env,
            TRIGGER_PAYLOAD: JSON.stringify(event),
            GITHUB_REPO: event.repo,
            GITHUB_COMMAND: event.command,
            ...(event.prNumber ? { GITHUB_PR_NUMBER: String(event.prNumber) } : {}),
          },
        },
        resources: src.resources,
        timeoutMs: 600_000,
        network: fullDaemon?.network,
        metadata: {
          triggerType: 'github',
          repo: event.repo,
          command: event.command,
          prNumber: event.prNumber ? String(event.prNumber) : '',
          issueUrl: event.issueUrl,
          installationId: String(event.installationId),
          sender: event.sender,
        },
      };

      sessionStore.create(sessionId, sessionRequest, daemon.role);
      governance.recordAction(daemon.role);
      daemonStore.recordInvocation(daemon.role);

      // Dispatch to worker
      dispatchSession(discovery, legacyWorkerClient, sessionStore, sessionId, sessionRequest);

      // Listen for completion to post results back
      const resultListener = (
        updatedId: string,
        session: import('./store/sessions.js').StoredSession,
      ) => {
        if (updatedId !== sessionId) return;
        const terminal = ['completed', 'failed', 'timeout', 'cancelled'];
        if (!terminal.includes(session.status)) return;

        sessionEvents.off('update', resultListener);

        const resultBody =
          session.status === 'completed'
            ? ((session.output as string) ?? session.stdout ?? 'Agent completed with no output.')
            : `Agent ${session.status}: ${session.stderr ?? 'Unknown error'}`;

        postComment({ auth: githubAuth }, event.installationId, event.issueUrl, resultBody).catch(
          (err) => {
            createLogger('github').error('Failed to post result', {
              sessionId,
              error: String(err),
            });
          },
        );
      };
      sessionEvents.on('update', resultListener);

      return c.json({ accepted: true, sessionId }, 202);
    });
  }

  // --- Audit ---

  app.openapi(listAuditRoute, (c) => {
    const query = c.req.valid('query');
    const result = auditStore.query(query);
    return c.json(result, 200);
  });

  app.openapi(auditStatsRoute, (c) => {
    return c.json(auditStore.stats(), 200);
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

  // --- Cost ---

  app.use('/v1/fleet/cost', authMiddleware(authConfig));
  app.openapi(costSummaryRoute, (c) => {
    const daemons = daemonStore.list();
    const byDaemon = daemons.map((d) => ({
      role: d.role,
      totalInvocations: d.stats.totalInvocations,
      totalVcpuSeconds: d.stats.totalVcpuSeconds,
      totalDurationMs: d.stats.totalDurationMs,
    }));
    const totalVcpuSeconds = byDaemon.reduce((sum, d) => sum + d.totalVcpuSeconds, 0);
    const totalSessions = byDaemon.reduce((sum, d) => sum + d.totalInvocations, 0);

    return c.json({ totalVcpuSeconds, totalSessions, byDaemon }, 200);
  });

  // --- Snapshots ---

  app.openapi(listSnapshotsRoute, (c) => {
    return c.json({ snapshots: [] }, 200);
  });

  const buildStore = deps.db ? createSqliteBuildStore(deps.db) : createBuildStore();

  app.openapi(buildSnapshotRoute, (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const jobId = `build-${randomUUID().slice(0, 8)}`;

    buildStore.create(jobId, id);

    // Dispatch build to a worker (fire-and-forget)
    void (async () => {
      try {
        const workers = discovery ? await discovery.getWorkers() : [];
        const worker = workers[0]; // pick any available worker
        if (worker) {
          const client = createWorkerClient(worker.name);
          await client.buildSnapshot(jobId, id, body);
          buildStore.updateStatus(jobId, 'building', { worker: worker.name });
        } else {
          buildStore.updateStatus(jobId, 'failed', {
            error: 'No workers available',
            completedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        buildStore.updateStatus(jobId, 'failed', {
          error: err instanceof Error ? err.message : String(err),
          completedAt: new Date().toISOString(),
        });
      }
    })();

    return c.json({ snapshotId: id, status: 'building' as const, jobId }, 202);
  });

  // --- Snapshot Configs ---

  app.openapi(listSnapshotConfigsRoute, (c) => {
    return c.json({ configs: snapshotConfigStore.list() }, 200);
  });

  app.openapi(createSnapshotConfigRoute, (c) => {
    const body = c.req.valid('json');
    if (snapshotConfigStore.get(body.id)) {
      return c.json(
        { error: { code: 'CONFLICT', message: `Snapshot config '${body.id}' already exists` } },
        409,
      );
    }
    const config = snapshotConfigStore.create(body);
    return c.json(config, 201);
  });

  app.openapi(getSnapshotConfigRoute, (c) => {
    const { id } = c.req.valid('param');
    const config = snapshotConfigStore.get(id);
    if (!config) {
      return c.json(
        {
          error: {
            code: 'SNAPSHOT_NOT_FOUND' as const,
            message: `Snapshot config '${id}' not found`,
          },
        },
        404,
      );
    }
    return c.json(config, 200);
  });

  app.openapi(updateSnapshotConfigRoute, (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const updated = snapshotConfigStore.update(id, body);
    if (!updated) {
      return c.json(
        {
          error: {
            code: 'SNAPSHOT_NOT_FOUND' as const,
            message: `Snapshot config '${id}' not found`,
          },
        },
        404,
      );
    }
    return c.json(updated, 200);
  });

  app.openapi(deleteSnapshotConfigRoute, (c) => {
    const { id } = c.req.valid('param');
    const deleted = snapshotConfigStore.delete(id);
    if (!deleted) {
      return c.json(
        {
          error: {
            code: 'SNAPSHOT_NOT_FOUND' as const,
            message: `Snapshot config '${id}' not found`,
          },
        },
        404,
      );
    }
    return c.body(null, 204);
  });

  // --- Provisioner (shared by setup wizard + provisioning routes) ---

  const { createProvisioner, createSshClient } = await import('@paws/provisioner');

  // Sanitize strings that may contain credentials before sending to clients
  function sanitize(s: string): string {
    return s
      .replace(/(?:AKIA|sk-|ghp_|gho_)[A-Za-z0-9/+=]{10,}/g, '[REDACTED]')
      .replace(/-----BEGIN[^-]*-----[\s\S]*?-----END[^-]*-----/g, '[REDACTED KEY]');
  }

  // --- Provisioning event bus (pub/sub for streaming to WebSocket clients) ---

  const { createProvisioningEventBus } = await import('./provisioning-events.js');
  const provisioningEvents = createProvisioningEventBus();

  const provisioner = createProvisioner({
    ssh: createSshClient(),
    onEvent: (event) => {
      const safeMessage = sanitize(event.message);
      const safeError = event.error ? sanitize(event.error) : undefined;

      // Update server status in store
      serverStore.update(event.serverId, {
        status: event.stage as import('@paws/provisioner').ServerStatus,
        ...(safeError ? { error: safeError } : {}),
      });

      // Broadcast to connected WebSocket clients
      provisioningEvents.publish(event);

      // Emit audit event for provisioning milestones
      auditStore.append({
        category: 'server',
        action: `server.${event.stage}`,
        resourceType: 'server',
        resourceId: event.serverId,
        severity: event.error ? 'error' : 'info',
        details: {
          message: safeMessage,
          progress: event.progress,
          ...(safeError ? { error: safeError } : {}),
        },
      });
    },
  });

  // --- EC2 lifecycle (shared across setup + server routes) ---

  const { createCredentialStore, createCredentialResolver, deriveKey } =
    await import('@paws/credentials');
  const encryptionKey = await deriveKey(deps.apiKey);
  const credentialStore = deps.credentialStore ?? createCredentialStore(deps.apiKey);
  const credentialResolver = createCredentialResolver(credentialStore);

  const { createEc2Lifecycle } = await import('./ec2-lifecycle.js');
  const ec2Lifecycle = createEc2Lifecycle({ encryptionKey });

  // --- Cloud connections (AWS account integration) ---

  const { createSqliteCloudConnectionStore, createCloudConnectionStore } =
    await import('./store/cloud-connections.js');
  const connectionStore = deps.db
    ? createSqliteCloudConnectionStore(deps.db)
    : createCloudConnectionStore();

  {
    const { createCloudConnectionRoutes } = await import('./routes/cloud-connections.js');
    const cloudRoutes = createCloudConnectionRoutes({ connectionStore, encryptionKey });
    app.route('/', cloudRoutes);
  }

  // --- Setup wizard ---

  {
    const setupRoutes = createSetupRoutes({
      serverStore,
      credentialStore,
      provisioner,
      upgradeWebSocket: deps.upgradeWebSocket,
      encryptionKey,
      ec2Lifecycle,
      provisioningEvents,
      createSession: async (prompt) => {
        const sessionId = randomUUID();
        sessionStore.create(sessionId, {
          snapshot: 'default',
          workload: { type: 'script' as const, script: prompt, env: {} },
          timeoutMs: 600_000,
        });
        dispatchSession(discovery, legacyWorkerClient, sessionStore, sessionId, {
          snapshot: 'default',
          workload: { type: 'script' as const, script: prompt, env: {} },
          timeoutMs: 600_000,
        });
        return { sessionId };
      },
    });
    app.route('/', setupRoutes);
  }

  // --- MCP server management routes ---

  const mcpServerStore = createMcpServerStore();

  {
    const mcpRoutes = createMcpRoutes({
      mcpServerStore,
      sessionStore,
    });
    app.route('/', mcpRoutes);
  }

  // --- Server management routes ---

  {
    const serverRoutes = createServerRoutes({
      serverStore,
      workerRegistry: deps.workerRegistry,
      ec2Lifecycle,
    });
    app.route('/', serverRoutes);
  }

  // --- Settings/admin routes ---

  if (passwordAuth) {
    const { createSettingsRoutes } = await import('./routes/settings.js');
    const settingsRoutes = createSettingsRoutes({
      passwordAuth,
      auditStore,
      daemonStore,
      sessionStore,
      discovery,
    });
    app.route('/', settingsRoutes);
  }

  // --- Provisioning routes (dashboard one-click provisioning) ---

  {
    const provisioningRoutes = createProvisioningRoutes({
      serverStore,
      provisioner,
      upgradeWebSocket: deps.upgradeWebSocket,
    });
    app.route('/', provisioningRoutes);
  }

  // --- MCP OAuth routes (no auth — handles its own OAuth flow) ---

  if (db && passwordAuth) {
    const { createOAuthProvider } = await import('./auth/oauth.js');
    const { createMcpOAuthRoutes } = await import('./routes/mcp-oauth.js');

    const oauthProvider = createOAuthProvider(db, passwordAuth);
    const issuerUrl =
      deps.oidc?.externalUrl ??
      process.env['EXTERNAL_URL'] ??
      `http://localhost:${process.env['PORT'] ?? '4000'}`;

    const mcpOAuthRoutes = createMcpOAuthRoutes({ oauth: oauthProvider, issuerUrl });
    app.route('/', mcpOAuthRoutes);
  }

  // --- WebSocket routes (require Bun runtime) ---

  if (deps.upgradeWebSocket) {
    // Worker call-home registration
    if (deps.workerRegistry) {
      registerWorkerWebSocket(app as unknown as Hono, deps.upgradeWebSocket, {
        apiKey: deps.apiKey,
        registry: deps.workerRegistry,
      });
    }

    // Session streaming (imported lazily to avoid circular deps)
    const { registerWebSocketRoutes } = await import('./routes/ws.js');
    registerWebSocketRoutes(app as unknown as Hono, deps.upgradeWebSocket, {
      apiKey: deps.apiKey,
      sessionStore,
      events: sessionEvents,
    });
  }

  // --- OpenAPI spec endpoint ---

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'paws Control Plane API',
      version: process.env['PAWS_VERSION'] ?? '0.0.0',
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
    createLogger('app').error('Unhandled error', { error: String(err) });
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
  });

  // --- EC2 state sync (background polling for instance state changes) ---

  const { createEc2Sync } = await import('./ec2-sync.js');
  const ec2Sync = createEc2Sync({ serverStore, connectionStore, ec2Lifecycle, encryptionKey });
  void ec2Sync.start();

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
