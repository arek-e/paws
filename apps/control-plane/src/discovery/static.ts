import type { Worker } from '@paws/domain-fleet';

import type { WorkerDiscovery } from './index.js';

/**
 * StaticDiscovery resolves worker status by polling a fixed list of URLs.
 *
 * Used in local development and single-node deployments where the worker URL
 * is known ahead of time (via WORKER_URL env var or explicit config).
 */
export function createStaticDiscovery(urls: string[]): WorkerDiscovery {
  return {
    async getWorkers(): Promise<Worker[]> {
      if (urls.length === 0) {
        return [];
      }

      const results = await Promise.allSettled(urls.map((url) => fetchWorkerStatus(url)));

      const workers: Worker[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value !== null) {
          workers.push(result.value);
        }
        // Unreachable workers are silently dropped from the list
      }
      return workers;
    },
  };
}

/** Fetch health from a worker URL and convert to a Worker record. */
async function fetchWorkerStatus(baseUrl: string): Promise<Worker | null> {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) {
      return null;
    }
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

    return {
      // Use the base URL as the worker name so that dispatchSession can
      // reconstruct the client by calling createWorkerClient(selected.name).
      name: baseUrl,
      status,
      type: 'firecracker' as const,
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
  if (raw === 'healthy' || raw === 'degraded' || raw === 'unhealthy') {
    return raw;
  }
  // Workers may return 'ok' — treat as healthy
  if (raw === 'ok') {
    return 'healthy';
  }
  return 'unhealthy';
}
