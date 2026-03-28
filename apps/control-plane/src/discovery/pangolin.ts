import type { Worker } from '@paws/types';

/**
 * Pangolin API discovery — polls Pangolin's site list to find connected workers.
 *
 * Each worker runs Newt (Pangolin's tunnel agent) which establishes a WireGuard
 * tunnel back to Gerbil on the control plane. Pangolin tracks connected sites
 * and assigns each a tunnel IP from the CGNAT range.
 *
 * Discovery flow:
 *   Pangolin API (GET /api/v1/org/{orgId}/sites)
 *     → filter to online sites
 *     → extract tunnel IP from subnet field
 *     → health-check each worker at http://{tunnelIP}:{port}/health
 *     → return Worker[] matching WorkerDiscovery interface
 */

export interface PangolinDiscoveryOptions {
  /** Pangolin API URL (e.g., http://pangolin:3000/api/v1). */
  apiUrl: string;
  /** Pangolin organization ID. */
  orgId: string;
  /**
   * Auth: either an API key (Bearer token) or session credentials (email+password).
   * Session auth logs in on first request and refreshes on 401.
   */
  apiKey?: string;
  email?: string;
  password?: string;
  /** Worker port. Defaults to 3000. */
  workerPort?: number;
  /** Poll interval in milliseconds. Defaults to 10_000 (10 seconds). */
  pollIntervalMs?: number;
  /** Grace period before removing a disconnected worker. Defaults to 30_000 (30s). */
  disconnectGraceMs?: number;
}

/** Shape of a site in Pangolin's API response. */
interface PangolinSite {
  siteId: string;
  name: string;
  online: boolean;
  subnet: string; // CIDR like "100.89.137.5/32"
  type: string; // "newt" | "local" | "wireguard"
  endpoint: string | null; // "65.108.10.170:56974" (public IP:port of the Newt agent)
}

interface PangolinSitesResponse {
  data: { sites: PangolinSite[] };
}

export function createPangolinDiscovery(opts: PangolinDiscoveryOptions) {
  const {
    apiUrl,
    apiKey,
    email,
    password,
    orgId,
    workerPort = 3000,
    pollIntervalMs = 10_000,
    disconnectGraceMs = 30_000,
  } = opts;

  // Session cookie for login-based auth
  let sessionCookie = '';

  // Cache: last known workers (kept on API failure for graceful degradation)
  let cachedWorkers: Worker[] = [];

  // Map worker name (URL) → Pangolin siteId for disconnect tracking
  const workerToSiteId = new Map<string, string>();

  // Track when sites went offline for grace period
  const disconnectTimestamps = new Map<string, number>();

  // Background poll state
  let timer: ReturnType<typeof setInterval> | null = null;

  let lastPollAt: string | null = null;
  let apiReachable = false;

  async function pollSites(): Promise<void> {
    lastPollAt = new Date().toISOString();
    let sites: PangolinSite[];
    try {
      sites = await fetchSites();
      apiReachable = true;
    } catch {
      apiReachable = false;
      // Keep cached state on failure — don't remove workers on transient errors
      return;
    }

    const now = Date.now();
    const onlineSites = sites.filter((s) => s.online && s.type !== 'local');

    // Track disconnections for grace period
    const currentSiteIds = new Set(onlineSites.map((s) => s.siteId));
    const previousSiteIds = new Set(
      cachedWorkers.map((w) => workerToSiteId.get(w.name)).filter(Boolean) as string[],
    );

    for (const siteId of previousSiteIds) {
      if (!currentSiteIds.has(siteId) && !disconnectTimestamps.has(siteId)) {
        disconnectTimestamps.set(siteId, now);
        console.log(`pangolin: worker ${siteId} disconnected, removing after grace period`);
      }
    }

    // Clean up grace periods for sites that came back online
    for (const siteId of currentSiteIds) {
      disconnectTimestamps.delete(siteId);
    }

    // Include workers still within grace period
    const graceWorkers = cachedWorkers.filter((w) => {
      const siteId = workerToSiteId.get(w.name);
      if (!siteId) return false;
      const disconnectTime = disconnectTimestamps.get(siteId);
      if (disconnectTime === undefined) return false;
      if (now - disconnectTime > disconnectGraceMs) {
        disconnectTimestamps.delete(siteId);
        workerToSiteId.delete(w.name);
        console.log(`pangolin: worker ${siteId} grace period expired, removed from fleet`);
        return false;
      }
      return true;
    });

    // Health-check online sites
    const healthChecked = await Promise.allSettled(
      onlineSites.map((site) => healthCheckSite(site)),
    );

    const freshWorkers: Worker[] = [];
    for (const result of healthChecked) {
      if (result.status === 'fulfilled' && result.value !== null) {
        freshWorkers.push(result.value);
      }
    }

    // Log new discoveries
    for (const w of freshWorkers) {
      const existed = cachedWorkers.some((c) => c.name === w.name);
      if (!existed) {
        const siteId = workerToSiteId.get(w.name) ?? w.name;
        console.log(`pangolin: discovered worker ${siteId} at ${w.name}`);
      }
    }

    cachedWorkers = [...freshWorkers, ...graceWorkers];
  }

  async function login(): Promise<void> {
    if (!email || !password) return;
    try {
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': 'x-csrf-protection',
        },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(5_000),
      });
      const cookies = res.headers.getSetCookie?.() ?? [];
      sessionCookie = cookies.map((c) => c.split(';')[0]).join('; ');
      if (res.ok) {
        console.log('pangolin: session login successful');
      } else {
        console.error(`pangolin: login failed with status ${res.status}`);
      }
    } catch (err) {
      console.error('pangolin: login request failed', err);
    }
  }

  function buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'x-csrf-token': 'x-csrf-protection' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (sessionCookie) {
      headers['Cookie'] = sessionCookie;
    }
    return headers;
  }

  async function fetchSites(): Promise<PangolinSite[]> {
    const url = `${apiUrl}/org/${orgId}/sites`;
    let res = await fetch(url, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(5_000),
    });

    // On 401, try re-login (session expired) and retry once
    if (res.status === 401 && email && password) {
      console.log('pangolin: session expired, re-authenticating...');
      await login();
      res = await fetch(url, {
        headers: buildHeaders(),
        signal: AbortSignal.timeout(5_000),
      });
    }

    if (res.status === 401) {
      console.error(
        'pangolin: API returned 401 — check credentials (PANGOLIN_API_KEY or PANGOLIN_EMAIL/PASSWORD)',
      );
      throw new Error('Pangolin API authentication failed');
    }

    if (!res.ok) {
      console.warn(`pangolin: API returned ${res.status}, keeping cached fleet state`);
      throw new Error(`Pangolin API error: ${res.status}`);
    }

    let body: PangolinSitesResponse;
    try {
      body = (await res.json()) as PangolinSitesResponse;
    } catch {
      console.error('pangolin: API returned malformed JSON, keeping cached fleet state');
      throw new Error('Pangolin API returned malformed JSON');
    }

    if (!Array.isArray(body.data?.sites)) {
      console.error('pangolin: API response missing data.sites array, keeping cached fleet state');
      throw new Error('Pangolin API response missing data.sites array');
    }

    return body.data.sites;
  }

  /** Fetch a single site's full details (includes endpoint IP not in list response). */
  async function fetchSiteDetail(siteId: string): Promise<{ endpoint?: string } | null> {
    try {
      const res = await fetch(`${apiUrl}/site/${siteId}`, {
        headers: buildHeaders(),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { data?: { endpoint?: string } };
      return body.data ?? null;
    } catch {
      return null;
    }
  }

  async function healthCheckSite(site: PangolinSite): Promise<Worker | null> {
    // Skip local sites (they're not workers)
    if (site.type === 'local') return null;

    // Fetch full site details to get the endpoint IP (not included in list response)
    const detail = await fetchSiteDetail(site.siteId);
    const endpoint = detail?.endpoint?.split(':')[0]; // "65.108.10.170:56974" → "65.108.10.170"
    const tunnelIp = site.subnet?.split('/')[0];
    const baseUrl = endpoint
      ? `http://${endpoint}:${workerPort}`
      : tunnelIp
        ? `http://${tunnelIp}:${workerPort}`
        : null;
    if (!baseUrl) return null;
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5_000) });
      if (!res.ok) return null;

      const body = (await res.json()) as {
        status: string;
        worker: string;
        uptime: number;
        capacity: {
          maxConcurrent: number;
          running: number;
          queued: number;
          available: number;
        };
      };

      const status = normalizeStatus(body.status);

      // Track siteId → worker URL mapping for disconnect detection
      workerToSiteId.set(baseUrl, site.siteId);

      return {
        // name = URL so dispatchSession can use it as the worker HTTP base URL
        name: baseUrl,
        status,
        capacity: {
          maxConcurrent: body.capacity.maxConcurrent,
          running: body.capacity.running,
          queued: body.capacity.queued,
          available: body.capacity.available,
        },
        snapshot: { id: 'default', version: 1, ageMs: 0 },
        uptime: body.uptime,
      };
    } catch {
      return null;
    }
  }

  function normalizeStatus(raw: string): 'healthy' | 'degraded' | 'unhealthy' {
    if (raw === 'healthy' || raw === 'degraded' || raw === 'unhealthy') return raw;
    if (raw === 'ok') return 'healthy';
    return 'unhealthy';
  }

  // Start background polling
  function startPolling(): void {
    if (timer) return;
    // Initial poll
    pollSites();
    timer = setInterval(pollSites, pollIntervalMs);
  }

  function stopPolling(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  // Login then start polling
  if (email && password) {
    login().then(() => startPolling());
  } else {
    startPolling();
  }

  return {
    async getWorkers(): Promise<Worker[]> {
      return cachedWorkers.filter((w) => w.status === 'healthy' || w.status === 'degraded');
    },
    stop: stopPolling,
    status(): { connected: boolean; tunnelWorkers: number; lastPollAt: string | null } {
      return {
        connected: apiReachable,
        tunnelWorkers: cachedWorkers.length,
        lastPollAt,
      };
    },
  };
}
