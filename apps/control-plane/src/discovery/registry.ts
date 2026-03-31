import { createLogger } from '@paws/logger';
import type { Worker } from '@paws/domain-fleet';

import type { WorkerDiscovery } from './index.js';

const log = createLogger('registry');

const HEARTBEAT_TIMEOUT_MS = 30_000;

export interface RegisteredWorker {
  name: string;
  url: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  capacity: {
    maxConcurrent: number;
    running: number;
    queued: number;
    available: number;
  };
  snapshot: { id: string; version: number; ageMs: number };
  uptime: number;
  connectedAt: string;
  lastHeartbeat: string;
}

export interface WorkerRegistry extends WorkerDiscovery {
  register(
    name: string,
    url: string,
    health: Omit<RegisteredWorker, 'name' | 'url' | 'connectedAt' | 'lastHeartbeat'>,
  ): void;
  heartbeat(
    name: string,
    health: Partial<Omit<RegisteredWorker, 'name' | 'url' | 'connectedAt' | 'lastHeartbeat'>>,
  ): void;
  unregister(name: string): void;
  get(name: string): RegisteredWorker | undefined;
  getAll(): RegisteredWorker[];
  count(): number;
}

export function createWorkerRegistry(): WorkerRegistry {
  const workers = new Map<string, RegisteredWorker>();

  return {
    register(name, url, health) {
      const now = new Date().toISOString();
      workers.set(name, {
        name,
        url,
        ...health,
        connectedAt: now,
        lastHeartbeat: now,
      });
      log.info('Worker registered', { name, url });
    },

    heartbeat(name, health) {
      const worker = workers.get(name);
      if (!worker) return;
      Object.assign(worker, health);
      worker.lastHeartbeat = new Date().toISOString();
    },

    unregister(name) {
      workers.delete(name);
      log.info('Worker unregistered', { name });
    },

    get(name) {
      return workers.get(name);
    },

    getAll() {
      return Array.from(workers.values());
    },

    count() {
      return workers.size;
    },

    async getWorkers(): Promise<Worker[]> {
      const now = Date.now();
      const result: Worker[] = [];

      for (const w of workers.values()) {
        const age = now - new Date(w.lastHeartbeat).getTime();
        if (age > HEARTBEAT_TIMEOUT_MS) {
          continue; // stale heartbeat, skip
        }
        result.push({
          name: w.url, // URL as name — used by dispatchSession to create client
          status: w.status,
          capacity: w.capacity,
          snapshot: w.snapshot,
          uptime: w.uptime,
        });
      }

      return result;
    },
  };
}
