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
  /** This worker's Pangolin site ID (numeric, for target attachment) */
  siteId: string;
  /** Pangolin domain ID for the base domain (from GET /org/{orgId}/domains) */
  domainId: string;
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
  /** Access control mode */
  access?: string | undefined;
  /** Auto-generated PIN (when access is 'pin') */
  pin?: string | undefined;
  /** Time-limited shareable link */
  shareLink?: string | undefined;
}

/**
 * Manages per-session Pangolin resources for port exposure.
 *
 * Creates "resources" within the worker's existing Pangolin site, each mapping
 * a subdomain to a host:port. When a session ends, resources are cleaned up.
 */
export function createPangolinResourceManager(config: PangolinResourceConfig) {
  const { apiUrl, apiKey, email, password, orgId, siteId, domainId, baseDomain } = config;

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
        const res = await authFetch(`${apiUrl}/resource/${tunnel.resourceId}`, {
          method: 'DELETE',
        });
        if (!res.ok && res.status !== 404) {
          console.error(`pangolin: failed to delete resource ${tunnel.resourceId}: ${res.status}`);
        }
      } catch (err) {
        console.error(`pangolin: error deleting resource ${tunnel.resourceId}:`, err);
      }
    }
  }

  /** Generate a subdomain for a session + port, using label if provided */
  function subdomain(sessionId: string, port: number, label?: string): string {
    const shortId = sessionId.slice(0, 8);
    if (label) {
      // Sanitize label for DNS: lowercase, replace non-alphanumeric with hyphens, trim
      const slug = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      if (slug) return `s-${shortId}-${slug}`;
    }
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
          const sub = subdomain(sessionId, portConfig.port, portConfig.label);
          const fullDomain = `${sub}.${baseDomain}`;

          // Step 1: Create resource (subdomain + domain)
          const createRes = await authFetch(`${apiUrl}/org/${orgId}/resource`, {
            method: 'PUT',
            body: JSON.stringify({
              name: `paws-${sub}`,
              subdomain: sub,
              domainId,
              http: true,
              protocol: 'tcp',
            }),
          });

          if (!createRes.ok) {
            const text = await createRes.text().catch(() => '');
            throw new Error(
              `Pangolin resource creation failed for port ${portConfig.port}: ${createRes.status} ${text}`,
            );
          }

          const createBody = (await createRes.json()) as {
            data: { resourceId: string | number };
          };
          const resourceId = String(createBody.data.resourceId);

          // Step 2: Add target (site + host + port)
          const targetRes = await authFetch(`${apiUrl}/resource/${resourceId}/target`, {
            method: 'PUT',
            body: JSON.stringify({
              siteId: Number(siteId),
              ip: 'localhost',
              port: hostPort,
              method: portConfig.protocol === 'https' ? 'https' : 'http',
            }),
          });

          if (!targetRes.ok) {
            const text = await targetRes.text().catch(() => '');
            // Clean up the resource we just created
            await authFetch(`${apiUrl}/resource/${resourceId}`, { method: 'DELETE' }).catch(
              () => {},
            );
            throw new Error(
              `Pangolin target creation failed for port ${portConfig.port}: ${targetRes.status} ${text}`,
            );
          }

          // Step 3: Configure access control on the resource
          const accessMode = portConfig.access ?? 'sso';
          let pin: string | undefined;

          if (accessMode === 'pin') {
            // Generate a 6-digit PIN
            pin = String(Math.floor(100000 + Math.random() * 900000));
            await authFetch(`${apiUrl}/resource/${resourceId}/auth`, {
              method: 'PUT',
              body: JSON.stringify({
                sso: false,
                pincodeEnabled: true,
                pincode: pin,
              }),
            }).catch((err) => {
              console.error(`pangolin: failed to set PIN for resource ${resourceId}:`, err);
            });
          } else if (accessMode === 'email') {
            const emails = portConfig.allowedEmails ?? [];
            await authFetch(`${apiUrl}/resource/${resourceId}/auth`, {
              method: 'PUT',
              body: JSON.stringify({
                sso: false,
                emailWhitelistEnabled: true,
                emailWhitelist: emails,
              }),
            }).catch((err) => {
              console.error(
                `pangolin: failed to set email whitelist for resource ${resourceId}:`,
                err,
              );
            });
          }
          // 'sso' is the default — no extra config needed

          // Step 4: Create a time-limited shareable link
          let shareLink: string | undefined;
          const shareLinkRes = await authFetch(`${apiUrl}/resource/${resourceId}/share-link`, {
            method: 'PUT',
            body: JSON.stringify({
              // Link expires when the session's timeout expires (default 10 min)
              expiresIn: '24h',
            }),
          }).catch(() => null);

          if (shareLinkRes?.ok) {
            const linkBody = (await shareLinkRes.json().catch(() => null)) as {
              data?: { link?: string; token?: string };
            } | null;
            if (linkBody?.data?.link) {
              shareLink = linkBody.data.link;
            } else if (linkBody?.data?.token) {
              shareLink = `https://${fullDomain}?token=${linkBody.data.token}`;
            }
          }

          tunnels.push({
            port: portConfig.port,
            hostPort,
            resourceId,
            publicUrl: `https://${fullDomain}`,
            label: portConfig.label,
            access: accessMode,
            pin,
            shareLink,
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
