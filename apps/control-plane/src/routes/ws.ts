import type { Hono } from 'hono';
import type { UpgradeWebSocket, WSContext } from 'hono/ws';

import type { SessionEvents } from '../events.js';
import type { SessionStore } from '../store/sessions.js';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'timeout', 'cancelled']);

export function registerWebSocketRoutes(
  app: Hono,
  upgradeWebSocket: UpgradeWebSocket,
  opts: {
    apiKey: string;
    sessionStore: SessionStore;
    events: SessionEvents;
  },
) {
  const { apiKey, sessionStore, events } = opts;

  // WebSocket: stream session updates
  // Auth via ?token= query param (WebSocket can't set custom headers)
  app.get(
    '/v1/sessions/:id/stream',
    upgradeWebSocket((c) => {
      const sessionId = c.req.param('id')!;
      const token = c.req.query('token');

      return {
        onOpen(_evt, ws) {
          // Auth check
          if (token !== apiKey) {
            ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
            ws.close(4001, 'Unauthorized');
            return;
          }

          // Send current state
          const session = sessionStore.get(sessionId);
          if (!session) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: `Session ${sessionId} not found`,
              }),
            );
            ws.close(4004, 'Not found');
            return;
          }

          // Send initial status
          ws.send(
            JSON.stringify({
              type: 'status',
              sessionId: session.sessionId,
              status: session.status,
              startedAt: session.startedAt,
              worker: session.worker,
            }),
          );

          // If already terminal, send complete and close
          if (TERMINAL_STATUSES.has(session.status)) {
            ws.send(
              JSON.stringify({
                type: 'complete',
                sessionId: session.sessionId,
                status: session.status,
                exitCode: session.exitCode,
                durationMs: session.durationMs,
              }),
            );
            ws.close(1000, 'Session already complete');
            return;
          }

          // Subscribe to updates
          const listener = (updatedId: string, updated: typeof session) => {
            if (updatedId !== sessionId) return;

            if (TERMINAL_STATUSES.has(updated.status)) {
              sendSafe(ws, {
                type: 'complete',
                sessionId: updated.sessionId,
                status: updated.status,
                exitCode: updated.exitCode,
                durationMs: updated.durationMs,
              });
              events.off('update', listener);
              ws.close(1000, 'Session complete');
            } else {
              sendSafe(ws, {
                type: 'status',
                sessionId: updated.sessionId,
                status: updated.status,
                startedAt: updated.startedAt,
                worker: updated.worker,
              });
            }
          };

          events.on('update', listener);

          // Store cleanup for onClose
          (ws as WSContext & { _cleanup?: () => void })._cleanup = () => {
            events.off('update', listener);
          };
        },

        onClose(_evt, ws) {
          const cleanup = (ws as WSContext & { _cleanup?: () => void })._cleanup;
          cleanup?.();
        },
      };
    }),
  );
}

function sendSafe(ws: WSContext, data: unknown) {
  try {
    ws.send(JSON.stringify(data));
  } catch {
    // Client disconnected
  }
}
