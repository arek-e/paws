import type { StoredSession } from './store/sessions.js';

type SessionListener = (sessionId: string, session: StoredSession) => void;

/** Simple pub/sub for session state changes */
export interface SessionEvents {
  on(event: 'update', listener: SessionListener): void;
  off(event: 'update', listener: SessionListener): void;
  emit(event: 'update', sessionId: string, session: StoredSession): void;
}

export function createSessionEvents(): SessionEvents {
  const listeners = new Set<SessionListener>();

  return {
    on(_event, listener) {
      listeners.add(listener);
    },
    off(_event, listener) {
      listeners.delete(listener);
    },
    emit(_event, sessionId, session) {
      for (const listener of listeners) {
        try {
          listener(sessionId, session);
        } catch {
          // Don't let one listener break others
        }
      }
    },
  };
}
