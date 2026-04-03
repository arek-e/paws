import { createRoute, z } from '@hono/zod-openapi';
import { OpenAPIHono } from '@hono/zod-openapi';
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
}

// ---------------------------------------------------------------------------
// URL generation
// ---------------------------------------------------------------------------

/** Generate exposed port URLs for a session */
export function generateExposedUrls(
  sessionId: string,
  expose: Array<{ port: number; label?: string; access?: string; pathPrefix?: string }>,
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

    // Default to first exposed port (path-based routing is a future enhancement)
    const targetPort = expose[0]!.port;

    // Forward to worker
    const workerUrl = session.worker;
    if (!workerUrl) {
      return c.text('No worker assigned to session', 502);
    }

    const targetUrl = `${workerUrl}/v1/sessions/${sessionId}/proxy/${targetPort}${remainingPath}`;

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

  // Subdomain-based routing middleware (optional, applied at app level)
  // Extracts session ID from Host header: s-abc123.fleet.tpops.dev → sessionId=abc123

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
