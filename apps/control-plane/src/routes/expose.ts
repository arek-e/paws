import { createRoute, z } from '@hono/zod-openapi';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { UpgradeWebSocket } from 'hono/ws';
import { createLogger } from '@paws/logger';
import type { SessionStore } from '@paws/domain-session';

const log = createLogger('expose');

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface ExposeDeps {
  sessionStore: SessionStore;
  /** Base domain for session URLs (e.g. "fleet.tpops.dev") */
  fleetDomain?: string;
  /** WebSocket upgrade function (needed for WS proxying to VMs) */
  upgradeWebSocket?: UpgradeWebSocket;
}

// ---------------------------------------------------------------------------
// URL generation
// ---------------------------------------------------------------------------

/** Generate exposed port URLs for a session */
export function generateExposedUrls(
  sessionId: string,
  expose: Array<{
    port: number;
    label?: string | undefined;
    access?: string | undefined;
    pathPrefix?: string | undefined;
  }>,
  fleetDomain?: string,
): Array<{ port: number; url: string; label?: string; access?: string; pin?: string }> {
  const baseUrl = fleetDomain ?? 'localhost:3000';
  const protocol = fleetDomain ? 'https' : 'http';

  return expose.map((e) => ({
    port: e.port,
    url: `${protocol}://s-${sessionId}.${baseUrl}${e.pathPrefix ?? '/'}`,
    ...(e.label ? { label: e.label } : {}),
    ...(e.access ? { access: e.access } : {}),
    ...(e.access === 'pin' ? { pin: generatePin() } : {}),
  }));
}

function generatePin(): string {
  const chars = '0123456789';
  let pin = '';
  for (let i = 0; i < 6; i++) {
    pin += chars[Math.floor(Math.random() * chars.length)];
  }
  return pin;
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const exposeHealthRoute = createRoute({
  method: 'get',
  path: '/s/{sessionId}/health/{port}',
  tags: ['Expose'],
  request: {
    params: z.object({
      sessionId: z.string(),
      port: z.string().regex(/^\d+$/),
    }),
  },
  responses: {
    200: {
      description: 'Port health check result',
      content: {
        'application/json': {
          schema: z.object({
            healthy: z.boolean(),
            status: z.number().optional(),
            reason: z.string().optional(),
          }),
        },
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve which exposed port to proxy to based on the request path */
function resolvePort(
  path: string,
  expose: Array<{ port: number; pathPrefix?: string }>,
): number | undefined {
  if (expose.length === 0) return undefined;

  // Try path-prefix matching first (longest match wins)
  const withPrefix = expose
    .filter((e) => e.pathPrefix && e.pathPrefix !== '/' && path.startsWith(e.pathPrefix))
    .sort((a, b) => (b.pathPrefix?.length ?? 0) - (a.pathPrefix?.length ?? 0));

  if (withPrefix.length > 0) return withPrefix[0]!.port;

  // Default to the first exposed port
  return expose[0]!.port;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createExposeRoutes(deps: ExposeDeps) {
  const { sessionStore } = deps;
  const app = new OpenAPIHono();

  // Health check for a specific port
  app.openapi(exposeHealthRoute, async (c) => {
    const { sessionId, port } = c.req.valid('param');
    const portNum = parseInt(port, 10);

    const session = sessionStore.get(sessionId);
    if (!session) {
      return c.json({ healthy: false, reason: 'session not found' }, 200);
    }

    const workerUrl = session.worker;
    if (!workerUrl) {
      return c.json({ healthy: false, reason: 'no worker assigned' }, 200);
    }

    try {
      const res = await fetch(`${workerUrl}/v1/sessions/${sessionId}/proxy/${portNum}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return c.json(await res.json(), 200);
    } catch {
      return c.json({ healthy: false, reason: 'worker unreachable' }, 200);
    }
  });

  // WebSocket proxy: /s/:sessionId/ws/* → worker WS proxy → VM
  if (deps.upgradeWebSocket) {
    const upgradeWs = deps.upgradeWebSocket;

    app.get(
      '/s/:sessionId/ws/*',
      upgradeWs((c) => {
        const sessionId = c.req.param('sessionId')!;

        const session = sessionStore.get(sessionId);
        if (!session || session.status !== 'running') {
          return {
            onOpen(_evt, ws) {
              ws.close(4004, 'Session not found or not running');
            },
          };
        }

        const expose = session.request.network?.expose ?? [];
        if (expose.length === 0) {
          return {
            onOpen(_evt, ws) {
              ws.close(4003, 'No ports exposed');
            },
          };
        }

        const workerUrl = session.worker;
        if (!workerUrl) {
          return {
            onOpen(_evt, ws) {
              ws.close(4502, 'No worker assigned');
            },
          };
        }

        const prefix = `/s/${sessionId}/ws`;
        const remainingPath = c.req.path.slice(prefix.length) || '/';
        const queryString = new URL(c.req.url).search;
        const targetPort = resolvePort(remainingPath, expose);

        if (!targetPort) {
          return {
            onOpen(_evt, ws) {
              ws.close(4003, 'Port not exposed');
            },
          };
        }

        // Convert worker HTTP URL to WS URL for the worker's WS proxy endpoint
        const workerWsUrl = workerUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
        const backendUrl = `${workerWsUrl}/v1/sessions/${sessionId}/proxy/${targetPort}/ws${remainingPath}${queryString}`;

        let backendWs: WebSocket | null = null;

        return {
          onOpen(_evt, clientWs) {
            log.debug('WebSocket proxy opening', {
              sessionId,
              port: targetPort,
              backend: backendUrl,
            });

            backendWs = new WebSocket(backendUrl);

            backendWs.addEventListener('open', () => {
              log.debug('Backend WebSocket connected', { sessionId, port: targetPort });
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

  // Catch-all reverse proxy: /s/:sessionId/* → worker → VM
  app.all('/s/:sessionId/*', async (c) => {
    const sessionId = c.req.param('sessionId');

    // Look up session
    const session = sessionStore.get(sessionId);
    if (!session || session.status !== 'running') {
      return c.text('Session not found or not running', 404);
    }

    // Resolve which port to proxy to
    const expose = session.request.network?.expose ?? [];
    if (expose.length === 0) {
      return c.text('No ports exposed for this session', 403);
    }

    // Strip /s/:sessionId prefix to get the remaining path
    const prefix = `/s/${sessionId}`;
    const remainingPath = c.req.path.slice(prefix.length) || '/';
    const queryString = new URL(c.req.url).search;

    const targetPort = resolvePort(remainingPath, expose);
    if (!targetPort) {
      return c.text('Port not exposed', 403);
    }

    // Forward to worker
    const workerUrl = session.worker;
    if (!workerUrl) {
      return c.text('No worker assigned to session', 502);
    }

    const targetUrl = `${workerUrl}/v1/sessions/${sessionId}/proxy/${targetPort}${remainingPath}${queryString}`;

    log.debug('Proxying to worker', {
      sessionId,
      port: targetPort,
      workerUrl,
      path: remainingPath,
    });

    try {
      const headers = new Headers(c.req.raw.headers);
      headers.delete('host');

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
      log.error('Expose proxy failed', { sessionId, port: targetPort, error: message });
      return c.text(`Failed to reach session: ${message}`, 502);
    }
  });

  return app;
}

/**
 * Extract session ID from subdomain.
 * Host: s-abc123.fleet.tpops.dev → "abc123"
 * Returns undefined if not a session subdomain.
 */
export function extractSessionFromHost(host: string, fleetDomain: string): string | undefined {
  if (!host.endsWith(`.${fleetDomain}`)) return undefined;
  const subdomain = host.slice(0, -(fleetDomain.length + 1));
  if (!subdomain.startsWith('s-')) return undefined;
  return subdomain.slice(2);
}
