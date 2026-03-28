import type { Worker } from '@paws/types';

import type { WorkerDiscovery } from './index.js';

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
  /** Pangolin internal API URL (e.g., http://pangolin:3001/api/v1). */
  apiUrl: string;
  /** Pangolin API key for authentication. */
  apiKey: string;
  /** Pangolin organization ID. */
  orgId: string;
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
  // Other fields exist but are not needed for discovery
}

interface PangolinSitesResponse {
  data: PangolinSite[];
}

export function createPangolinDiscovery(opts: PangolinDiscoveryOptions): WorkerDiscovery {
  const {
    apiUrl,
    apiKey,
    orgId,
    workerPort = 3000,
    pollIntervalMs = 10_000,
    disconnectGraceMs = 30_000,
  } = opts;

  // Cache: last known workers (kept on API failure for graceful degradation)
  let cachedWorkers: Worker[] = [];

  // Map worker name (URL) → Pangolin siteId for disconnect tracking
  const workerToSiteId = new Map<string, string>();

  // Track when sites went offline for grace period
  const disconnectTimestamps = new Map<string, number>();

  // Background poll state
  let timer: ReturnType<typeof setInterval> | null = null;

  async function pollSites(): Promise<void> {
    let sites: PangolinSite[];
    try {
      sites = await fetchSites();
    } catch (err) {
      // Keep cached state on failure — don't remove workers on transient errors
      return;
    }

    const now = Date.now();
    const onlineSites = sites.filter((s) => s.online && s.subnet);

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

  async function fetchSites(): Promise<PangolinSite[]> {
    const url = `${apiUrl}/org/${orgId}/sites`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5_000),
    });

    if (res.status === 401) {
      console.error(
        'pangolin: API returned 401 — check PANGOLIN_API_KEY is valid and has not expired',
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

    if (!Array.isArray(body.data)) {
      console.error('pangolin: API response missing data array, keeping cached fleet state');
      throw new Error('Pangolin API response missing data array');
    }

    return body.data;
  }

  async function healthCheckSite(site: PangolinSite): Promise<Worker | null> {
    const tunnelIp = site.subnet.split('/')[0];
    if (!tunnelIp) return null;

    const baseUrl = `http://${tunnelIp}:${workerPort}`;
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

  // Auto-start polling on creation
  startPolling();

  const discovery: WorkerDiscovery & { stop(): void } = {
    async getWorkers(): Promise<Worker[]> {
      return cachedWorkers.filter((w) => w.status === 'healthy' || w.status === 'degraded');
    },
    stop: stopPolling,
  };

  return discovery;
}
