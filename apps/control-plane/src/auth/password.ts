/**
 * Simple password-based auth for the dashboard.
 * Used on bare IP installs where OIDC/Dex isn't available.
 * Admin creates an account on first visit, then logs in with email + password.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
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
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf-8');
      admin = JSON.parse(data) as AdminUser;
      console.log(`[auth] Loaded admin account: ${admin.email}`);
    }
  } catch (err) {
    console.error('[auth] Failed to load admin.json:', err);
  }

  function save() {
    if (!admin) return;
    try {
      const dir = dirname(filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, JSON.stringify(admin, null, 2));
      console.log(`[auth] Saved admin account to ${filePath}`);
    } catch (err) {
      console.error('[auth] Failed to save admin.json:', err);
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
    isFirstRun(): boolean {
      return admin === null;
    },

    async createAdmin(email: string, password: string): Promise<string | null> {
      if (admin) return null;

      admin = {
        email,
        passwordHash: await hashPassword(password),
        createdAt: new Date().toISOString(),
      };
      save();

      return this.createSession(email);
    },

    async login(email: string, password: string): Promise<string | null> {
      if (!admin) return null;
      if (admin.email !== email) return null;

      const hash = await hashPassword(password);
      if (hash !== admin.passwordHash) return null;

      return this.createSession(email);
    },

    createSession(email: string): string {
      const token = randomUUID();
      sessions.set(token, {
        token,
        email,
        expiresAt: Date.now() + SESSION_TTL_MS,
      });
      return token;
    },

    validateSession(token: string): SessionToken | null {
      const session = sessions.get(token);
      if (!session) return null;
      if (Date.now() > session.expiresAt) {
        sessions.delete(token);
        return null;
      }
      return session;
    },

    getAdminEmail(): string | null {
      return admin?.email ?? null;
    },
  };
}

export type PasswordAuth = ReturnType<typeof createPasswordAuth>;
