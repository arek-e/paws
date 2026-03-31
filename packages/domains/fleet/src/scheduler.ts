import type { Worker } from './worker.js';

/**
 * Compute the available capacity for a worker.
 *
 * Available capacity = maxConcurrent - running - queued
 */
export function workerAvailableCapacity(worker: Worker): number {
  return worker.capacity.maxConcurrent - worker.capacity.running - worker.capacity.queued;
}

/**
 * Select the least-loaded worker from a fleet.
 *
 * Selection criteria (in order):
 * 1. Worker must have status 'healthy'
 * 2. Worker must have available capacity > 0
 * 3. Among eligible workers, pick the one with the highest available capacity
 * 4. Tie-breaking: first-seen wins (stable ordering)
 *
 * Returns null if no healthy worker with available capacity exists.
 */
export function selectWorker(workers: Worker[]): Worker | null {
  let best: Worker | null = null;
  let bestCapacity = 0;

  for (const worker of workers) {
    if (worker.status !== 'healthy') {
      continue;
    }

    const available = workerAvailableCapacity(worker);
    if (available <= 0) {
      continue;
    }

    if (available > bestCapacity) {
      best = worker;
      bestCapacity = available;
    }
  }

  return best;
}
