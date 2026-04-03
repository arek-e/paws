import { describe, expect, test, vi } from 'vitest';

import { createSettingsRoutes, type SettingsRouteDeps } from './settings.js';
import type { PasswordAuth } from '../auth/password.js';
import { createAuditStore } from '@paws/domain-audit';
import { createSessionStore } from '@paws/domain-session';
import { createDaemonStore } from '../store/daemons.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockPasswordAuth(overrides: Partial<PasswordAuth> = {}): PasswordAuth {
  return {
    isFirstRun: () => false,
    createAdmin: vi.fn(async () => 'token-admin'),
    login: vi.fn(async () => 'token-new'),
    createSession: vi.fn(() => 'token-created'),
    validateSession: vi.fn((token: string) =>
      token === 'valid-token'
        ? { token: 'valid-token', email: 'admin@test.com', expiresAt: Date.now() + 86400000 }
        : null,
    ),
    logout: vi.fn(),
    getAdminEmail: vi.fn(() => 'admin@test.com'),
    updatePassword: vi.fn(async () => {}),
    listSessions: vi.fn(() => [
      { token: 'valid-token', email: 'admin@test.com', expiresAt: Date.now() + 86400000 },
      { token: 'other-token', email: 'admin@test.com', expiresAt: Date.now() + 86400000 },
    ]),
    invalidateAllExcept: vi.fn(() => 1),
    ...overrides,
  } as unknown as PasswordAuth;
}

function createTestDeps(overrides?: Partial<SettingsRouteDeps>): SettingsRouteDeps {
  return {
    passwordAuth: createMockPasswordAuth(),
    auditStore: createAuditStore(),
    daemonStore: createDaemonStore(),
    sessionStore: createSessionStore(),
    discovery: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /v1/settings/account', () => {
  test('returns email when admin exists', async () => {
    const deps = createTestDeps();
    const app = createSettingsRoutes(deps);

    const res = await app.request('/v1/settings/account');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe('admin@test.com');
  });

  test('returns 404 when no admin account', async () => {
    const deps = createTestDeps({
      passwordAuth: createMockPasswordAuth({ getAdminEmail: vi.fn(() => null) }),
    });
    const app = createSettingsRoutes(deps);

    const res = await app.request('/v1/settings/account');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NO_ACCOUNT');
  });
});

describe('POST /v1/settings/change-password', () => {
  test('returns 400 when missing fields', async () => {
    const deps = createTestDeps();
    const app = createSettingsRoutes(deps);

    const res = await app.request('/v1/settings/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'old' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 when new password too short', async () => {
    const deps = createTestDeps();
    const app = createSettingsRoutes(deps);

    const res = await app.request('/v1/settings/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'paws_session=valid-token',
      },
      body: JSON.stringify({ currentPassword: 'old-password', newPassword: 'short' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain('8 characters');
  });

  test('returns 401 when session is invalid', async () => {
    const deps = createTestDeps();
    const app = createSettingsRoutes(deps);

    const res = await app.request('/v1/settings/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'paws_session=invalid-token',
      },
      body: JSON.stringify({ currentPassword: 'old-password', newPassword: 'new-password-long' }),
    });
    expect(res.status).toBe(401);
  });

  test('returns 403 when current password is wrong', async () => {
    const deps = createTestDeps({
      passwordAuth: createMockPasswordAuth({
        login: vi.fn(async () => null),
      }),
    });
    const app = createSettingsRoutes(deps);

    const res = await app.request('/v1/settings/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'paws_session=valid-token',
      },
      body: JSON.stringify({
        currentPassword: 'wrong-password',
        newPassword: 'new-password-long',
      }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_PASSWORD');
  });

  test('changes password and invalidates other sessions', async () => {
    const mockAuth = createMockPasswordAuth();
    const deps = createTestDeps({ passwordAuth: mockAuth });
    const app = createSettingsRoutes(deps);

    const res = await app.request('/v1/settings/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'paws_session=valid-token',
      },
      body: JSON.stringify({
        currentPassword: 'correct-password',
        newPassword: 'new-password-long',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('password_changed');
    expect(mockAuth.updatePassword).toHaveBeenCalledWith('admin@test.com', 'new-password-long');
    expect(mockAuth.invalidateAllExcept).toHaveBeenCalledWith('valid-token');
  });
});

describe('GET /v1/settings/sessions', () => {
  test('returns session list with current marker', async () => {
    const deps = createTestDeps();
    const app = createSettingsRoutes(deps);

    const res = await app.request('/v1/settings/sessions', {
      headers: { cookie: 'paws_session=valid-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(2);
    // First session matches the cookie token
    const current = body.sessions.find((s: { isCurrent: boolean }) => s.isCurrent);
    expect(current).toBeDefined();
    expect(current.tokenPrefix).toBe('valid-to...');
  });
});

describe('DELETE /v1/settings/sessions/:token', () => {
  test('revokes a session by token prefix', async () => {
    const mockAuth = createMockPasswordAuth();
    const deps = createTestDeps({ passwordAuth: mockAuth });
    const app = createSettingsRoutes(deps);

    const res = await app.request('/v1/settings/sessions/other-to...', {
      method: 'DELETE',
      headers: { cookie: 'paws_session=valid-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('revoked');
    expect(mockAuth.logout).toHaveBeenCalledWith('other-token');
  });

  test('returns 404 for unknown session prefix', async () => {
    const deps = createTestDeps();
    const app = createSettingsRoutes(deps);

    const res = await app.request('/v1/settings/sessions/unknown-...', {
      method: 'DELETE',
      headers: { cookie: 'paws_session=valid-token' },
    });
    expect(res.status).toBe(404);
  });

  test('returns 400 when trying to revoke current session', async () => {
    const deps = createTestDeps();
    const app = createSettingsRoutes(deps);

    const res = await app.request('/v1/settings/sessions/valid-to...', {
      method: 'DELETE',
      headers: { cookie: 'paws_session=valid-token' },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('CANNOT_REVOKE_CURRENT');
  });
});

describe('DELETE /v1/settings/sessions (revoke all)', () => {
  test('revokes all other sessions', async () => {
    const mockAuth = createMockPasswordAuth();
    const deps = createTestDeps({ passwordAuth: mockAuth });
    const app = createSettingsRoutes(deps);

    const res = await app.request('/v1/settings/sessions', {
      method: 'DELETE',
      headers: { cookie: 'paws_session=valid-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('revoked');
    expect(body.count).toBe(1);
    expect(mockAuth.invalidateAllExcept).toHaveBeenCalledWith('valid-token');
  });

  test('returns 401 when no session cookie', async () => {
    const deps = createTestDeps();
    const app = createSettingsRoutes(deps);

    const res = await app.request('/v1/settings/sessions', { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/settings/info', () => {
  test('returns system info', async () => {
    const deps = createTestDeps();
    const app = createSettingsRoutes(deps);

    const res = await app.request('/v1/settings/info');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.uptime).toBe('number');
    expect(body.daemons).toBe(0);
    expect(body.activeSessions).toBe(0);
    expect(body.workers).toBe(0);
  });

  test('counts workers from discovery', async () => {
    const deps = createTestDeps({
      discovery: {
        getWorkers: async () => [
          {
            name: 'w1',
            status: 'healthy' as const,
            type: 'firecracker' as const,
            capacity: { maxConcurrent: 5, running: 0, queued: 0, available: 5 },
            snapshot: { id: 'test', version: 1, ageMs: 0 },
            uptime: 100,
          },
        ],
      },
    });
    const app = createSettingsRoutes(deps);

    const res = await app.request('/v1/settings/info');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workers).toBe(1);
  });
});
