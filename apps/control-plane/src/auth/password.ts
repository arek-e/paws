/**
 * Password-based auth backed by SQLite via Drizzle ORM.
 * Admin creates an account on first visit, then logs in with email + password.
 */

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { createLogger } from '@paws/logger';

import type { PawsDatabase } from '../db/index.js';
import { adminUsers, authSessions } from '../db/schema.js';

const log = createLogger('auth');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createPasswordAuth(db: PawsDatabase) {
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
      const rows = db.select().from(adminUsers).limit(1).all();
      return rows.length === 0;
    },

    async createAdmin(email: string, password: string): Promise<string | null> {
      if (!this.isFirstRun()) return null;

      db.insert(adminUsers)
        .values({
          email,
          passwordHash: await hashPassword(password),
          createdAt: new Date().toISOString(),
        })
        .run();

      log.info('Created admin account', { email });
      return this.createSession(email);
    },

    async login(email: string, password: string): Promise<string | null> {
      const admin = db.select().from(adminUsers).where(eq(adminUsers.email, email)).get();
      if (!admin) return null;

      const hash = await hashPassword(password);
      if (hash !== admin.passwordHash) return null;

      return this.createSession(email);
    },

    createSession(email: string): string {
      const token = randomUUID();
      const expiresAt = Date.now() + SESSION_TTL_MS;

      db.insert(authSessions).values({ token, email, expiresAt }).run();

      return token;
    },

    validateSession(token: string): { token: string; email: string; expiresAt: number } | null {
      const session = db.select().from(authSessions).where(eq(authSessions.token, token)).get();
      if (!session) return null;

      if (Date.now() > session.expiresAt) {
        db.delete(authSessions).where(eq(authSessions.token, token)).run();
        return null;
      }

      return session;
    },

    logout(token: string): void {
      db.delete(authSessions).where(eq(authSessions.token, token)).run();
    },

    getAdminEmail(): string | null {
      const admin = db.select().from(adminUsers).limit(1).get();
      return admin?.email ?? null;
    },
  };
}

export type PasswordAuth = ReturnType<typeof createPasswordAuth>;
