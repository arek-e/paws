import { createLogger } from '@paws/logger';
import type { Logger } from '@paws/logger';

import { matchesDomain, findCredentials, findDomainEntry } from './domain-match.js';
import type { ProxyConfig, ProxyInstance } from './types.js';

/**
 * Create a credential injection proxy.
 *
 * The proxy:
 * 1. Receives HTTP/HTTPS connections (via iptables DNAT or HTTPS_PROXY)
 * 2. Checks hostname against the domain allowlist — drops non-matching connections
 * 3. Terminates TLS using the provided CA (for HTTPS)
 * 4. Injects configured credential headers
 * 5. Forwards to the real upstream server (or configured target override)
 * 6. Streams response back to the caller
 */
export function createProxy(config: ProxyConfig): ProxyInstance {
  const allowlist = Object.keys(config.domains);

  const log: Logger = createLogger(
    'proxy',
    config.sessionId ? { sessionId: config.sessionId } : {},
  );

  let httpServer: ReturnType<typeof Bun.serve> | undefined;
  let httpsServer: ReturnType<typeof Bun.serve> | undefined;
  let actualHttpPort = 0;
  let started = false;

  // Store CA — either provided or we require it
  const caCert = config.ca?.cert;
  const caKey = config.ca?.key;

  /**
   * Forward a request with allowlist check and credential injection.
   * DRY helper used by both HTTP and HTTPS servers.
   */
  function forwardRequest(req: Request, protocol: 'http' | 'https'): Promise<Response> | Response {
    const startTime = performance.now();
    const url = new URL(req.url);
    const hostname = url.hostname;

    if (!matchesDomain(hostname, allowlist)) {
      log.warn('domain blocked', {
        domain: hostname,
        method: req.method,
        path: url.pathname,
      });
      return new Response('Blocked by network policy', { status: 403 });
    }

    const entry = findDomainEntry(hostname, config.domains);
    const creds = findCredentials(hostname, config.domains);
    const credentialsInjected = creds != null && Object.keys(creds).length > 0;

    // Build upstream request with injected credentials
    const headers = new Headers(req.headers);
    if (creds) {
      for (const [key, value] of Object.entries(creds)) {
        headers.set(key, value);
      }
    }

    // Determine upstream URL
    let upstreamUrl: string;
    if (entry?.target) {
      // Target override — for testing, point at local fake server
      const targetUrl = new URL(entry.target);
      upstreamUrl = `${targetUrl.origin}${url.pathname}${url.search}`;
    } else if (protocol === 'https') {
      upstreamUrl = `https://${hostname}${url.pathname}${url.search}`;
    } else {
      upstreamUrl = url.toString();
    }

    return fetch(
      new Request(upstreamUrl, {
        method: req.method,
        headers,
        body: req.body,
        redirect: 'manual',
      }),
    ).then(
      (upstream) => {
        const durationMs = Math.round(performance.now() - startTime);

        log.info('request forwarded', {
          domain: hostname,
          method: req.method,
          path: url.pathname,
          statusCode: upstream.status,
          durationMs,
          credentialsInjected,
          protocol,
        });

        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: upstream.headers,
        });
      },
      (_err) => {
        const durationMs = Math.round(performance.now() - startTime);

        log.error('upstream connection failed', {
          domain: hostname,
          method: req.method,
          path: url.pathname,
          durationMs,
          credentialsInjected,
          protocol,
        });

        // Catch fetch errors to prevent credential headers from leaking in stack traces
        return new Response(`Upstream connection failed for ${hostname}`, { status: 502 });
      },
    );
  }

  const instance: ProxyInstance = {
    async start() {
      if (started) return;
      started = true;

      // HTTP proxy — intercepts port 80 traffic (or acts as HTTP proxy)
      httpServer = Bun.serve({
        hostname: config.listen.host,
        port: config.listen.port,
        fetch(req) {
          return forwardRequest(req, 'http');
        },
      });
      actualHttpPort = httpServer.port ?? config.listen.port;

      // HTTPS proxy — terminates TLS with credential injection
      if (caCert && caKey) {
        httpsServer = Bun.serve({
          hostname: config.listen.host,
          port: config.listen.port + 1,
          tls: {
            cert: caCert,
            key: caKey,
          },
          fetch(req) {
            return forwardRequest(req, 'https');
          },
        });
        // httpsPort is listen.port + 1 by convention
      }

      log.info('proxy started', {
        host: config.listen.host,
        httpPort: actualHttpPort,
        httpsPort: caCert ? config.listen.port + 1 : null,
        allowlistedDomains: allowlist.length,
      });
    },

    async stop() {
      if (httpServer) {
        httpServer.stop();
        httpServer = undefined;
      }
      if (httpsServer) {
        httpsServer.stop();
        httpsServer = undefined;
      }
      started = false;
      log.info('proxy stopped');
    },

    address() {
      return { host: config.listen.host, port: actualHttpPort };
    },

    ca() {
      if (!caCert || !caKey) {
        throw new Error('No CA configured');
      }
      return { cert: caCert, key: caKey };
    },
  };

  return instance;
}
