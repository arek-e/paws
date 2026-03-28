import type { Hono } from 'hono';
import type { UpgradeWebSocket } from 'hono/ws';

import type { WorkerRegistry } from '../discovery/registry.js';

export function registerWorkerWebSocket(
  app: Hono,
  upgradeWebSocket: UpgradeWebSocket,
  opts: {
    apiKey: string;
    registry: WorkerRegistry;
  },
) {
  const { apiKey, registry } = opts;

  app.get(
    '/v1/workers/register',
    upgradeWebSocket((c) => {
      const token = c.req.query('token');
      const name = c.req.query('name') ?? 'unknown';
      const url = c.req.query('url') ?? '';

      return {
        onOpen(_evt, ws) {
          if (token !== apiKey) {
            ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
            ws.close(4001, 'Unauthorized');
            return;
          }

          if (!url) {
            ws.send(JSON.stringify({ type: 'error', message: 'Missing url param' }));
            ws.close(4000, 'Missing url');
            return;
          }

          // Register with default health until first heartbeat
          registry.register(name, url, {
            status: 'healthy',
            capacity: { maxConcurrent: 0, running: 0, queued: 0, available: 0 },
            snapshot: { id: 'unknown', version: 0, ageMs: 0 },
            uptime: 0,
          });

          ws.send(JSON.stringify({ type: 'registered', name }));
        },

        onMessage(evt, _ws) {
          try {
            const data = JSON.parse(typeof evt.data === 'string' ? evt.data : '');
            if (data.type === 'heartbeat') {
              registry.heartbeat(name, {
                status: data.status ?? 'healthy',
                capacity: data.capacity,
                uptime: data.uptime,
                snapshot: data.snapshot,
              });
            }
          } catch {
            // Ignore malformed messages
          }
        },

        onClose() {
          registry.unregister(name);
        },
      };
    }),
  );
}
