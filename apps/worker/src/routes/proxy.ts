import type { Hono } from 'hono';
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
 * WebSocket upgrade is handled transparently: if the incoming request has
 * `Connection: Upgrade`, the response is streamed back as-is.
 */
export function registerProxyRoutes(app: Hono, executor: Executor) {
  // ALL /v1/sessions/:id/proxy/:port/* — forward to VM guest
  app.all('/v1/sessions/:id/proxy/:port{[0-9]+}/*', async (c) => {
    const sessionId = c.req.param('id');
    const portStr = c.req.param('port');
    const port = parseInt(portStr, 10);

    if (isNaN(port) || port < 1 || port > 65535) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid port' } }, 400);
    }

    // Look up active session
    const session = executor.activeSessions.get(sessionId);
    if (!session || session.status !== 'running') {
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

    // The session must have a network allocation with a guest IP
    const allocation = (session as { allocation?: { guestIp: string } }).allocation;
    if (!allocation) {
      return c.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Session has no network allocation' } },
        500,
      );
    }

    // Build target URL — strip the proxy prefix to get the remaining path
    const proxyPrefix = `/v1/sessions/${sessionId}/proxy/${portStr}`;
    const remainingPath = c.req.path.slice(proxyPrefix.length) || '/';
    const targetUrl = `http://${allocation.guestIp}:${port}${remainingPath}`;

    log.debug('Proxying to VM', { sessionId, port, targetUrl });

    try {
      // Forward the request to the VM
      const headers = new Headers(c.req.raw.headers);
      // Remove hop-by-hop headers that shouldn't be forwarded
      headers.delete('host');
      headers.set('host', `${allocation.guestIp}:${port}`);

      const response = await fetch(targetUrl, {
        method: c.req.method,
        headers,
        body: c.req.raw.body,
        redirect: 'manual',
      });

      // Stream the response back
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

    const session = executor.activeSessions.get(sessionId);
    if (!session || session.status !== 'running') {
      return c.json({ healthy: false, reason: 'session not found' }, 404);
    }

    const allocation = (session as { allocation?: { guestIp: string } }).allocation;
    if (!allocation) {
      return c.json({ healthy: false, reason: 'no allocation' }, 500);
    }

    try {
      const res = await fetch(`http://${allocation.guestIp}:${port}/`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(2000),
      });
      return c.json({ healthy: true, status: res.status });
    } catch {
      return c.json({ healthy: false, reason: 'connection failed' });
    }
  });
}
