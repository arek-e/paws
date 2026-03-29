/**
 * Simple password-based auth for the dashboard.
 * Used on bare IP installs where OIDC/Dex isn't available.
 * Admin creates an account on first visit, then logs in with email + password.
 */

import { randomUUID } from 'node:crypto';

export interface AdminUser {
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface SessionToken {
  token: string;
  email: string;
  expiresAt: number;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createPasswordAuth(dataDir: string) {
  let admin: AdminUser | null = null;
  const sessions = new Map<string, SessionToken>();
  const filePath = `${dataDir}/admin.json`;

  // Load existing admin from disk
  try {
    const data = require('fs').readFileSync(filePath, 'utf-8');
    admin = JSON.parse(data) as AdminUser;
  } catch {
    // No admin yet
  }

  function save() {
    if (!admin) return;
    try {
      const { mkdirSync, writeFileSync } = require('fs');
      const { dirname } = require('path');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(admin, null, 2));
    } catch {
      // Non-fatal
    }
  }

  async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  return {
    /** Is this a fresh install with no admin? */
    isFirstRun(): boolean {
      return admin === null;
    },

    /** Create the admin account (first run only) */
    async createAdmin(email: string, password: string): Promise<string | null> {
      if (admin) return null; // Already exists

      admin = {
        email,
        passwordHash: await hashPassword(password),
        createdAt: new Date().toISOString(),
      };
      save();

      // Auto-login after creation
      return this.createSession(email);
    },

    /** Verify credentials and create a session */
    async login(email: string, password: string): Promise<string | null> {
      if (!admin) return null;
      if (admin.email !== email) return null;

      const hash = await hashPassword(password);
      if (hash !== admin.passwordHash) return null;

      return this.createSession(email);
    },

    /** Create a session token */
    createSession(email: string): string {
      const token = randomUUID();
      sessions.set(token, {
        token,
        email,
        expiresAt: Date.now() + SESSION_TTL_MS,
      });
      return token;
    },

    /** Validate a session token */
    validateSession(token: string): SessionToken | null {
      const session = sessions.get(token);
      if (!session) return null;
      if (Date.now() > session.expiresAt) {
        sessions.delete(token);
        return null;
      }
      return session;
    },

    /** Get admin email */
    getAdminEmail(): string | null {
      return admin?.email ?? null;
    },
  };
}

export type PasswordAuth = ReturnType<typeof createPasswordAuth>;
