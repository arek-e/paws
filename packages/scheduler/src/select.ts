import type { Worker } from '@paws/types';

/**
 * Compute the available capacity for a worker.
 *
 * Available capacity = maxConcurrent - running - queued
 *
 * This reflects how many additional sessions a worker can accept right now.
 * A worker with available capacity <= 0 is at or over capacity and should not
 * be selected.
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
 *    (i.e. least loaded relative to its maximum)
 * 4. Tie-breaking: if two workers have equal available capacity, prefer the one
 *    that appears first in the array (stable, predictable, easy to test)
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

    // Strictly greater-than so first-seen wins on ties (stable ordering)
    if (available > bestCapacity) {
      best = worker;
      bestCapacity = available;
    }
  }

  return best;
}
