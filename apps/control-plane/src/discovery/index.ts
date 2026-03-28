import type { Worker } from '@paws/types';

/**
 * WorkerDiscovery provides a live view of available worker nodes.
 *
 * Implementations include:
 * - StaticDiscovery: fixed list of URLs from config (local dev / single-node)
 * - K8sDiscovery: watches Kubernetes pods and health-checks them
 */
export interface WorkerDiscovery {
  /** Returns the current list of workers with their health/capacity status. */
  getWorkers(): Promise<Worker[]>;
}

export type { Worker };
