import { desc, eq, inArray } from 'drizzle-orm';

import type { CreateSessionRequest, Session } from '@paws/types';

import type { PawsDatabase } from '../db/index.js';
import { sessions as sessionsTable } from '../db/schema.js';

export interface StoredSession {
  sessionId: string;
  status: Session['status'];
  request: CreateSessionRequest;
  daemonRole?: string | undefined;
  exitCode?: number | undefined;
  stdout?: string | undefined;
  stderr?: string | undefined;
  output?: unknown;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  durationMs?: number | undefined;
  worker?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  /** VM resources allocated (captured from request at creation) */
  resources?: { vcpus: number; memoryMB: number } | undefined;
  /** Cost in vCPU-seconds — computed on completion */
  vcpuSeconds?: number | undefined;
  /** Ports exposed from the VM via Pangolin tunnel */
  exposedPorts?: Array<{ port: number; url: string; label?: string | undefined }> | undefined;
}

export interface SessionStore {
  create(sessionId: string, request: CreateSessionRequest, daemonRole?: string): StoredSession;
  get(sessionId: string): StoredSession | undefined;
  updateStatus(sessionId: string, status: Session['status'], result?: Partial<StoredSession>): void;
  listAll(limit?: number): StoredSession[];
  listByDaemon(role: string, limit?: number): StoredSession[];
  countActiveSessions(): number;
}

/** In-memory session store for v0.1 */
export function createSessionStore(): SessionStore {
  const sessions = new Map<string, StoredSession>();

  return {
    create(sessionId, request, daemonRole) {
      const session: StoredSession = {
        sessionId,
        status: 'pending',
        request,
        daemonRole,
        metadata: request.metadata as Record<string, unknown> | undefined,
        resources: request.resources
          ? { vcpus: request.resources.vcpus, memoryMB: request.resources.memoryMB }
          : { vcpus: 2, memoryMB: 4096 }, // defaults match ResourcesSchema
      };
      sessions.set(sessionId, session);
      return session;
    },

    get(sessionId) {
      return sessions.get(sessionId);
    },

    updateStatus(sessionId, status, result) {
      const session = sessions.get(sessionId);
      if (!session) return;
      session.status = status;
      if (result) {
        Object.assign(session, result);
      }
      // Compute vcpuSeconds on terminal states when duration is known
      const terminal = ['completed', 'failed', 'timeout', 'cancelled'];
      if (terminal.includes(status) && session.durationMs && session.resources) {
        session.vcpuSeconds = (session.resources.vcpus * session.durationMs) / 1000;
      }
    },

    listAll(limit = 50) {
      return Array.from(sessions.values()).reverse().slice(0, limit);
    },

    listByDaemon(role, limit = 10) {
      const results: StoredSession[] = [];
      for (const session of sessions.values()) {
        if (session.daemonRole === role) {
          results.push(session);
        }
      }
      return results.slice(-limit);
    },

    countActiveSessions() {
      let count = 0;
      for (const session of sessions.values()) {
        if (session.status === 'pending' || session.status === 'running') {
          count++;
        }
      }
      return count;
    },
  };
}

type SessionRow = typeof sessionsTable.$inferSelect;

function rowToStoredSession(row: SessionRow): StoredSession {
  return {
    sessionId: row.sessionId,
    status: row.status as Session['status'],
    request: row.request as CreateSessionRequest,
    daemonRole: row.daemonRole ?? undefined,
    exitCode: row.exitCode ?? undefined,
    stdout: row.stdout ?? undefined,
    stderr: row.stderr ?? undefined,
    output: row.output ?? undefined,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    durationMs: row.durationMs ?? undefined,
    worker: row.worker ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? undefined,
    resources: (row.resources as { vcpus: number; memoryMB: number }) ?? undefined,
    vcpuSeconds: row.vcpuSeconds ?? undefined,
    exposedPorts:
      (row.exposedPorts as Array<{ port: number; url: string; label?: string }>) ?? undefined,
  };
}

/** SQLite-backed session store */
export function createSqliteSessionStore(db: PawsDatabase): SessionStore {
  return {
    create(sessionId, request, daemonRole) {
      const resources = request.resources
        ? { vcpus: request.resources.vcpus, memoryMB: request.resources.memoryMB }
        : { vcpus: 2, memoryMB: 4096 };

      db.insert(sessionsTable)
        .values({
          sessionId,
          status: 'pending',
          request: request as Record<string, unknown>,
          daemonRole: daemonRole ?? null,
          metadata: (request.metadata as Record<string, unknown>) ?? null,
          resources,
        })
        .run();
      return this.get(sessionId)!;
    },

    get(sessionId) {
      const row = db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.sessionId, sessionId))
        .get();
      return row ? rowToStoredSession(row) : undefined;
    },

    updateStatus(sessionId, status, result) {
      const values: Record<string, unknown> = { status };
      if (result) {
        if (result.exitCode !== undefined) values['exitCode'] = result.exitCode;
        if (result.stdout !== undefined) values['stdout'] = result.stdout;
        if (result.stderr !== undefined) values['stderr'] = result.stderr;
        if (result.output !== undefined) values['output'] = result.output;
        if (result.startedAt !== undefined) values['startedAt'] = result.startedAt;
        if (result.completedAt !== undefined) values['completedAt'] = result.completedAt;
        if (result.durationMs !== undefined) values['durationMs'] = result.durationMs;
        if (result.worker !== undefined) values['worker'] = result.worker;
        if (result.metadata !== undefined) values['metadata'] = result.metadata;
        if (result.exposedPorts !== undefined) values['exposedPorts'] = result.exposedPorts;
      }

      db.update(sessionsTable).set(values).where(eq(sessionsTable.sessionId, sessionId)).run();

      // Compute vcpuSeconds on terminal states
      const terminal = ['completed', 'failed', 'timeout', 'cancelled'];
      if (terminal.includes(status)) {
        const session = this.get(sessionId);
        if (session?.durationMs && session.resources) {
          const vcpuSeconds = (session.resources.vcpus * session.durationMs) / 1000;
          db.update(sessionsTable)
            .set({ vcpuSeconds })
            .where(eq(sessionsTable.sessionId, sessionId))
            .run();
        }
      }
    },

    listAll(limit = 50) {
      return db
        .select()
        .from(sessionsTable)
        .orderBy(desc(sessionsTable.sessionId))
        .limit(limit)
        .all()
        .map(rowToStoredSession);
    },

    listByDaemon(role, limit = 10) {
      return db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.daemonRole, role))
        .limit(limit)
        .all()
        .map(rowToStoredSession);
    },

    countActiveSessions() {
      return db
        .select()
        .from(sessionsTable)
        .where(inArray(sessionsTable.status, ['pending', 'running']))
        .all().length;
    },
  };
}
