import type { Hono } from 'hono';
import type { UpgradeWebSocket } from 'hono/ws';
import { createLogger } from '@paws/logger';

import type { Executor } from '../session/executor.js';

const log = createLogger('worker-proxy');

/**
 * Register inbound proxy routes on the worker.
 *
 * These routes forward HTTP traffic from the control plane to a VM's exposed
 * ports via the TAP device. The worker host has a direct route to the guest IP
 * (172.16.x.2) — no iptables changes needed for inbound traffic.
 *
 * WebSocket upgrades are detected and proxied via Bun's native WebSocket.
 */
export function registerProxyRoutes(
  app: Hono,
  executor: Executor,
  upgradeWebSocket?: UpgradeWebSocket,
) {
  // WebSocket proxy route (must be registered before the catch-all)
  if (upgradeWebSocket) {
    app.get(
      '/v1/sessions/:id/proxy/:port{[0-9]+}/ws/*',
      upgradeWebSocket((c) => {
        const sessionId = c.req.param('id')!;
        const portStr = c.req.param('port')!;
        const port = parseInt(portStr, 10);

        const conn = executor.getSessionConnection(sessionId);
        if (!conn) {
          return {
            onOpen(_evt, ws) {
              ws.close(4004, 'Session not found');
            },
          };
        }

        const proxyPrefix = `/v1/sessions/${sessionId}/proxy/${portStr}/ws`;
        const remainingPath = c.req.path.slice(proxyPrefix.length) || '/';
        const queryString = new URL(c.req.url).search;
        const targetWsUrl = `ws://${conn.guestIp}:${port}${remainingPath}${queryString}`;

        let backendWs: WebSocket | null = null;

        return {
          onOpen(_evt, clientWs) {
            log.debug('WebSocket proxy opening', { sessionId, port, target: targetWsUrl });

            backendWs = new WebSocket(targetWsUrl);

            backendWs.addEventListener('open', () => {
              log.debug('Backend WebSocket connected', { sessionId, port });
            });

            backendWs.addEventListener('message', (evt) => {
              try {
                if (typeof evt.data === 'string') {
                  clientWs.send(evt.data);
                } else if (evt.data instanceof ArrayBuffer) {
                  clientWs.send(new Uint8Array(evt.data));
                }
              } catch {
                // Client disconnected
              }
            });

            backendWs.addEventListener('close', (evt) => {
              clientWs.close(evt.code, evt.reason);
            });

            backendWs.addEventListener('error', () => {
              clientWs.close(4502, 'Backend connection failed');
            });
          },

          onMessage(evt, _ws) {
            if (backendWs?.readyState === WebSocket.OPEN) {
              if (typeof evt.data === 'string') {
                backendWs.send(evt.data);
              } else if (evt.data instanceof ArrayBuffer) {
                backendWs.send(evt.data);
              }
            }
          },

          onClose(_evt, _ws) {
            if (backendWs && backendWs.readyState !== WebSocket.CLOSED) {
              backendWs.close();
            }
            backendWs = null;
          },

          onError(_evt, _ws) {
            if (backendWs && backendWs.readyState !== WebSocket.CLOSED) {
              backendWs.close();
            }
            backendWs = null;
          },
        };
      }),
    );
  }

  // ALL /v1/sessions/:id/proxy/:port/* — forward HTTP to VM guest
  app.all('/v1/sessions/:id/proxy/:port{[0-9]+}/*', async (c) => {
    const sessionId = c.req.param('id');
    const portStr = c.req.param('port');
    const port = parseInt(portStr, 10);

    if (isNaN(port) || port < 1 || port > 65535) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid port' } }, 400);
    }

    // Look up session connection via runtime adapter
    const conn = executor.getSessionConnection(sessionId);
    if (!conn) {
      return c.json(
        {
          error: {
            code: 'SESSION_NOT_FOUND',
            message: `Session ${sessionId} not found or not running`,
          },
        },
        404,
      );
    }

    // Build target URL — strip the proxy prefix to get the remaining path
    const proxyPrefix = `/v1/sessions/${sessionId}/proxy/${portStr}`;
    const remainingPath = c.req.path.slice(proxyPrefix.length) || '/';
    const queryString = new URL(c.req.url).search;
    const targetUrl = `http://${conn.guestIp}:${port}${remainingPath}${queryString}`;

    // If client sends Upgrade: websocket on the catch-all route (no upgradeWebSocket available),
    // redirect them to the /ws/ sub-path
    if (c.req.header('upgrade')?.toLowerCase() === 'websocket') {
      if (!upgradeWebSocket) {
        return c.json(
          { error: { code: 'NOT_AVAILABLE', message: 'WebSocket proxy not configured' } },
          501,
        );
      }
      // Shouldn't reach here — the WS route above should match first
      return c.json(
        { error: { code: 'PROXY_ERROR', message: 'Use /ws/ path for WebSocket connections' } },
        400,
      );
    }

    log.debug('Proxying to VM', { sessionId, port, targetUrl });

    try {
      const headers = new Headers(c.req.raw.headers);
      headers.delete('host');
      headers.set('host', `${conn.guestIp}:${port}`);

      const response = await fetch(targetUrl, {
        method: c.req.method,
        headers,
        body: c.req.raw.body,
        redirect: 'manual',
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Proxy request failed', { sessionId, port, error: message });
      return c.json(
        {
          error: {
            code: 'PROXY_ERROR',
            message: `Failed to connect to VM port ${port}: ${message}`,
          },
        },
        502,
      );
    }
  });

  // GET /v1/sessions/:id/proxy/:port/health — TCP connect check
  app.get('/v1/sessions/:id/proxy/:port{[0-9]+}/health', async (c) => {
    const sessionId = c.req.param('id');
    const port = parseInt(c.req.param('port'), 10);

    const conn = executor.getSessionConnection(sessionId);
    if (!conn) {
      return c.json({ healthy: false, reason: 'session not found' }, 404);
    }

    try {
      const res = await fetch(`http://${conn.guestIp}:${port}/`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(2000),
      });
      return c.json({ healthy: true, status: res.status });
    } catch {
      return c.json({ healthy: false, reason: 'connection failed' });
    }
  });
}
