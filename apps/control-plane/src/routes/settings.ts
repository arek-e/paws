/**
 * Admin settings routes — account management, session management, system info.
 * Internal admin routes using plain Hono (not OpenAPI).
 */

import { statSync } from 'node:fs';

import { Hono } from 'hono';

import type { PasswordAuth } from '../auth/password.js';
import type { AuditStore } from '../store/audit.js';
import type { DaemonStore } from '../store/daemons.js';
import type { SessionStore } from '../store/sessions.js';
import type { WorkerDiscovery } from '../discovery/index.js';

export interface SettingsRouteDeps {
  passwordAuth: PasswordAuth;
  auditStore: AuditStore;
  daemonStore: DaemonStore;
  sessionStore: SessionStore;
  discovery: WorkerDiscovery | null;
}

const startTime = Date.now();

export function createSettingsRoutes(deps: SettingsRouteDeps) {
  const { passwordAuth, auditStore, daemonStore, sessionStore, discovery } = deps;
  const app = new Hono();

  // --- GET /v1/settings/account ---

  app.get('/v1/settings/account', (c) => {
    const email = passwordAuth.getAdminEmail();
    if (!email) {
      return c.json({ error: { code: 'NO_ACCOUNT', message: 'No admin account found' } }, 404);
    }
    return c.json({ email });
  });

  // --- POST /v1/settings/change-password ---

  app.post('/v1/settings/change-password', async (c) => {
    const body = await c.req
      .json<{
        currentPassword: string;
        newPassword: string;
      }>()
      .catch(() => null);

    if (!body?.currentPassword || !body?.newPassword) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Current and new password required' } },
        400,
      );
    }

    if (body.newPassword.length < 8) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'New password must be at least 8 characters',
          },
        },
        400,
      );
    }

    // Get current session token from cookie
    const cookies = c.req.header('cookie') ?? '';
    const match = cookies.match(/paws_session=([^;]+)/);
    const currentToken = match?.[1] ?? '';

    // Validate current session to get email
    const session = passwordAuth.validateSession(currentToken);
    if (!session) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid session' } }, 401);
    }

    // Verify current password by attempting a login
    const loginResult = await passwordAuth.login(session.email, body.currentPassword);
    if (!loginResult) {
      return c.json(
        { error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' } },
        403,
      );
    }

    // The login created a new session token — clean it up since we don't need it
    passwordAuth.logout(loginResult);

    // Update password: use the changePassword method we'll add, or re-create
    await passwordAuth.updatePassword(session.email, body.newPassword);

    // Invalidate all other sessions
    passwordAuth.invalidateAllExcept(currentToken);

    auditStore.append({
      category: 'auth',
      action: 'auth.password_changed',
      actor: session.email,
      severity: 'info',
      details: { email: session.email },
    });

    return c.json({ status: 'password_changed' });
  });

  // --- GET /v1/settings/sessions ---

  app.get('/v1/settings/sessions', (c) => {
    const cookies = c.req.header('cookie') ?? '';
    const match = cookies.match(/paws_session=([^;]+)/);
    const currentToken = match?.[1] ?? '';

    const sessions = passwordAuth.listSessions();
    const result = sessions.map((s) => ({
      tokenPrefix: s.token.slice(0, 8) + '...',
      email: s.email,
      expiresAt: s.expiresAt,
      isCurrent: s.token === currentToken,
    }));

    return c.json({ sessions: result });
  });

  // --- DELETE /v1/settings/sessions/:token ---

  app.delete('/v1/settings/sessions/:token', (c) => {
    const tokenPrefix = c.req.param('token');
    const cookies = c.req.header('cookie') ?? '';
    const match = cookies.match(/paws_session=([^;]+)/);
    const currentToken = match?.[1] ?? '';

    // Find the session matching this prefix
    const sessions = passwordAuth.listSessions();
    const target = sessions.find((s) => s.token.slice(0, 8) + '...' === tokenPrefix);

    if (!target) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Session not found' } }, 404);
    }

    // Prevent revoking current session
    if (target.token === currentToken) {
      return c.json(
        { error: { code: 'CANNOT_REVOKE_CURRENT', message: 'Cannot revoke current session' } },
        400,
      );
    }

    passwordAuth.logout(target.token);

    const currentSession = passwordAuth.validateSession(currentToken);
    auditStore.append({
      category: 'auth',
      action: 'auth.session_revoked',
      actor: currentSession?.email ?? 'unknown',
      severity: 'info',
      details: { revokedTokenPrefix: tokenPrefix },
    });

    return c.json({ status: 'revoked' });
  });

  // --- DELETE /v1/settings/sessions (revoke all other) ---

  app.delete('/v1/settings/sessions', (c) => {
    const cookies = c.req.header('cookie') ?? '';
    const match = cookies.match(/paws_session=([^;]+)/);
    const currentToken = match?.[1] ?? '';

    if (!currentToken) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'No session' } }, 401);
    }

    const count = passwordAuth.invalidateAllExcept(currentToken);

    const session = passwordAuth.validateSession(currentToken);
    auditStore.append({
      category: 'auth',
      action: 'auth.sessions_revoked_all',
      actor: session?.email ?? 'unknown',
      severity: 'info',
      details: { revokedCount: count },
    });

    return c.json({ status: 'revoked', count });
  });

  // --- GET /v1/settings/info ---

  app.get('/v1/settings/info', async (c) => {
    const version = process.env['PAWS_VERSION'] ?? '0.0.0';
    const commit = process.env['PAWS_COMMIT'] ?? 'unknown';
    const buildDate = process.env['PAWS_BUILD_DATE'] ?? 'unknown';
    const uptime = Date.now() - startTime;

    // Worker count
    let workerCount = 0;
    if (discovery) {
      try {
        const workers = await discovery.getWorkers();
        workerCount = workers.length;
      } catch {
        // Discovery unavailable
      }
    }

    // Daemon count
    const daemonCount = daemonStore.list().length;

    // Session count (auth sessions)
    const authSessionCount = passwordAuth.listSessions().length;

    // Active VM sessions
    const activeSessionCount = sessionStore
      .listAll(1000)
      .filter((s) => s.status === 'pending' || s.status === 'running').length;

    // DB file size
    let dbSizeBytes: number | null = null;
    const dataDir = process.env['DATA_DIR'] ?? '/var/lib/paws/data';
    try {
      const stat = statSync(`${dataDir}/paws.db`);
      dbSizeBytes = stat.size;
    } catch {
      // DB file not found
    }

    return c.json({
      version,
      commit,
      buildDate,
      uptime,
      workers: workerCount,
      daemons: daemonCount,
      authSessions: authSessionCount,
      activeSessions: activeSessionCount,
      dbSizeBytes,
    });
  });

  return app;
}
