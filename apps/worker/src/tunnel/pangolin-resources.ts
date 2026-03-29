import type { PortExposure } from '@paws/types';

export interface PangolinResourceConfig {
  /** Pangolin API URL (e.g., http://pangolin:3001/api/v1) */
  apiUrl: string;
  /** API key for Bearer auth */
  apiKey?: string | undefined;
  /** Session credentials (alternative to apiKey) */
  email?: string | undefined;
  password?: string | undefined;
  /** Pangolin organization ID */
  orgId: string;
  /** This worker's Pangolin site ID */
  siteId: string;
  /** Base domain for generated URLs (e.g., "fleet.tpops.dev") */
  baseDomain: string;
}

export interface ExposedTunnel {
  /** Port inside the VM */
  port: number;
  /** Allocated host port for iptables DNAT */
  hostPort: number;
  /** Pangolin resource ID (for cleanup) */
  resourceId: string;
  /** Public URL to access the port */
  publicUrl: string;
  /** Human-readable label */
  label?: string | undefined;
}

/**
 * Manages per-session Pangolin resources for port exposure.
 *
 * Creates "resources" within the worker's existing Pangolin site, each mapping
 * a subdomain to a host:port. When a session ends, resources are cleaned up.
 */
export function createPangolinResourceManager(config: PangolinResourceConfig) {
  const { apiUrl, apiKey, email, password, orgId, siteId, baseDomain } = config;

  let sessionCookie = '';

  async function login(): Promise<void> {
    if (!email || !password) return;
    const res = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': 'x-csrf-protection',
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Pangolin login failed: ${res.status}`);
    }
    const cookies = res.headers.getSetCookie?.() ?? [];
    sessionCookie = cookies.map((c: string) => c.split(';')[0]).join('; ');
  }

  function buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-csrf-token': 'x-csrf-protection',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (sessionCookie) {
      headers['Cookie'] = sessionCookie;
    }
    return headers;
  }

  async function authFetch(url: string, init: RequestInit): Promise<Response> {
    let res = await fetch(url, {
      ...init,
      headers: { ...buildHeaders(), ...(init.headers as Record<string, string>) },
      signal: AbortSignal.timeout(10_000),
    });

    // Retry once on 401 with fresh session
    if (res.status === 401 && email && password) {
      await login();
      res = await fetch(url, {
        ...init,
        headers: { ...buildHeaders(), ...(init.headers as Record<string, string>) },
        signal: AbortSignal.timeout(10_000),
      });
    }

    return res;
  }

  /** Best-effort cleanup of Pangolin resources */
  async function cleanupTunnels(tunnels: ExposedTunnel[]): Promise<void> {
    for (const tunnel of tunnels) {
      try {
        const res = await authFetch(
          `${apiUrl}/org/${orgId}/site/${siteId}/resource/${tunnel.resourceId}`,
          { method: 'DELETE' },
        );
        if (!res.ok && res.status !== 404) {
          console.error(`pangolin: failed to delete resource ${tunnel.resourceId}: ${res.status}`);
        }
      } catch (err) {
        console.error(`pangolin: error deleting resource ${tunnel.resourceId}:`, err);
      }
    }
  }

  /** Generate a subdomain for a session + port */
  function subdomain(sessionId: string, port: number): string {
    const shortId = sessionId.slice(0, 8);
    return `s-${shortId}-${port}`;
  }

  return {
    /**
     * Create Pangolin resources for each exposed port.
     * Returns the created tunnels with public URLs.
     */
    async expose(
      sessionId: string,
      ports: PortExposure[],
      hostPorts: number[],
    ): Promise<ExposedTunnel[]> {
      if (email && password && !sessionCookie) {
        await login();
      }

      const tunnels: ExposedTunnel[] = [];

      try {
        for (let i = 0; i < ports.length; i++) {
          const portConfig = ports[i]!;
          const hostPort = hostPorts[i]!;
          const sub = subdomain(sessionId, portConfig.port);
          const fullDomain = `${sub}.${baseDomain}`;

          const res = await authFetch(`${apiUrl}/org/${orgId}/site/${siteId}/resource`, {
            method: 'POST',
            body: JSON.stringify({
              subdomain: sub,
              fullDomain,
              target: hostPort,
              protocol: portConfig.protocol ?? 'http',
            }),
          });

          if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(
              `Pangolin resource creation failed for port ${portConfig.port}: ${res.status} ${text}`,
            );
          }

          const body = (await res.json()) as { data: { resourceId: string } };

          tunnels.push({
            port: portConfig.port,
            hostPort,
            resourceId: body.data.resourceId,
            publicUrl: `https://${fullDomain}`,
            label: portConfig.label,
          });
        }
      } catch (err) {
        // Clean up any resources created before the failure
        if (tunnels.length > 0) {
          await cleanupTunnels(tunnels);
        }
        throw err;
      }

      return tunnels;
    },

    /** Delete all Pangolin resources for a session (best-effort, logs errors) */
    async cleanup(tunnels: ExposedTunnel[]): Promise<void> {
      await cleanupTunnels(tunnels);
    },
  };
}

export type PangolinResourceManager = ReturnType<typeof createPangolinResourceManager>;
