import type { NetworkConfig } from '@paws/types';

import { matchesDomain, findCredentials } from './domain-match.js';
import type { SessionCa } from './ca.js';

/** Configuration for the per-VM proxy */
export interface ProxyConfig {
  /** Host IP to listen on (host-side of TAP) */
  listenHost: string;
  /** Port for HTTP interception */
  httpPort?: number;
  /** Port for HTTPS interception */
  httpsPort?: number;
  /** Network policy (allowlist + credentials) */
  network: NetworkConfig;
  /** Session CA for TLS MITM */
  ca: SessionCa;
}

/** Handle to a running proxy process */
export interface ProxyHandle {
  /** HTTP server port */
  httpPort: number;
  /** HTTPS server port */
  httpsPort: number;
  /** Stop the proxy */
  stop: () => void;
}

const DEFAULT_HTTP_PORT = 8080;
const DEFAULT_HTTPS_PORT = 8443;

/**
 * Create a per-VM TLS MITM proxy.
 *
 * The proxy:
 * 1. Receives connections redirected by iptables DNAT
 * 2. Reads SNI hostname from TLS ClientHello (HTTPS) or Host header (HTTP)
 * 3. Checks against the allowlist — drops non-matching connections
 * 4. Terminates TLS using the session CA (for HTTPS)
 * 5. Injects configured credential headers
 * 6. Forwards to the real upstream server
 * 7. Streams response back to the VM
 *
 * For v0.1 this is a Bun-based HTTP CONNECT proxy with TLS termination.
 * The MITM CA is generated per-session and injected into the VM trust store.
 */
export function createProxy(config: ProxyConfig): ProxyHandle {
  const httpPort = config.httpPort ?? DEFAULT_HTTP_PORT;
  const httpsPort = config.httpsPort ?? DEFAULT_HTTPS_PORT;
  const allowlist = buildAllowlist(config.network);

  // HTTP proxy — intercepts port 80 traffic
  const httpServer = Bun.serve({
    hostname: config.listenHost,
    port: httpPort,
    async fetch(req) {
      const url = new URL(req.url);
      const hostname = url.hostname;

      if (!matchesDomain(hostname, allowlist)) {
        return new Response('Blocked by network policy', { status: 403 });
      }

      // Build upstream request with injected credentials
      const headers = new Headers(req.headers);
      const creds = findCredentials(hostname, config.network.credentials);
      if (creds) {
        for (const [key, value] of Object.entries(creds)) {
          headers.set(key, value);
        }
      }

      const upstream = await fetch(
        new Request(url.toString(), {
          method: req.method,
          headers,
          body: req.body,
          redirect: 'manual',
        }),
      );

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers,
      });
    },
  });

  // HTTPS proxy — terminates TLS and forwards with credential injection
  const httpsServer = Bun.serve({
    hostname: config.listenHost,
    port: httpsPort,
    tls: {
      cert: config.ca.cert,
      key: config.ca.key,
    },
    async fetch(req) {
      const url = new URL(req.url);
      const hostname = url.hostname;

      if (!matchesDomain(hostname, allowlist)) {
        return new Response('Blocked by network policy', { status: 403 });
      }

      // Build upstream request with injected credentials
      const headers = new Headers(req.headers);
      const creds = findCredentials(hostname, config.network.credentials);
      if (creds) {
        for (const [key, value] of Object.entries(creds)) {
          headers.set(key, value);
        }
      }

      // Forward to real upstream over HTTPS
      const upstreamUrl = `https://${hostname}${url.pathname}${url.search}`;
      const upstream = await fetch(
        new Request(upstreamUrl, {
          method: req.method,
          headers,
          body: req.body,
          redirect: 'manual',
        }),
      );

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers,
      });
    },
  });

  return {
    httpPort: httpServer.port ?? httpPort,
    httpsPort: httpsServer.port ?? httpsPort,
    stop() {
      httpServer.stop();
      httpsServer.stop();
    },
  };
}

/** Build the full allowlist from network config (allowOut + credential domains) */
function buildAllowlist(network: NetworkConfig): string[] {
  const domains = new Set<string>(network.allowOut);
  for (const domain of Object.keys(network.credentials)) {
    domains.add(domain);
  }
  return [...domains];
}
