import type { CreateSessionRequest, Session } from '@paws/types';

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
