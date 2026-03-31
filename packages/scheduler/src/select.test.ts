import type { Worker } from '@paws/domain-fleet';
import { describe, expect, it } from 'vitest';

import { selectWorker, workerAvailableCapacity } from './select.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorker(
  name: string,
  status: Worker['status'],
  maxConcurrent: number,
  running: number,
  queued: number,
): Worker {
  return {
    name,
    status,
    capacity: {
      maxConcurrent,
      running,
      queued,
      // `available` is the pre-computed field on the schema — we mirror the
      // same calculation so fixtures are internally consistent.
      available: Math.max(0, maxConcurrent - running - queued),
    },
    snapshot: { id: 'test-snapshot', version: 1, ageMs: 0 },
    uptime: 0,
  };
}

// ---------------------------------------------------------------------------
// workerAvailableCapacity
// ---------------------------------------------------------------------------

describe('workerAvailableCapacity', () => {
  it('returns maxConcurrent when worker is idle', () => {
    const worker = makeWorker('w1', 'healthy', 5, 0, 0);
    expect(workerAvailableCapacity(worker)).toBe(5);
  });

  it('subtracts running sessions', () => {
    const worker = makeWorker('w1', 'healthy', 5, 3, 0);
    expect(workerAvailableCapacity(worker)).toBe(2);
  });

  it('subtracts queued sessions', () => {
    const worker = makeWorker('w1', 'healthy', 5, 0, 2);
    expect(workerAvailableCapacity(worker)).toBe(3);
  });

  it('subtracts both running and queued sessions', () => {
    const worker = makeWorker('w1', 'healthy', 5, 2, 2);
    expect(workerAvailableCapacity(worker)).toBe(1);
  });

  it('returns zero when at full capacity', () => {
    const worker = makeWorker('w1', 'healthy', 5, 5, 0);
    expect(workerAvailableCapacity(worker)).toBe(0);
  });

  it('returns negative when over capacity (running + queued > maxConcurrent)', () => {
    // This can legitimately happen if config changes mid-flight
    const worker = makeWorker('w1', 'healthy', 5, 4, 3);
    expect(workerAvailableCapacity(worker)).toBe(-2);
  });
});

// ---------------------------------------------------------------------------
// selectWorker — empty / no workers
// ---------------------------------------------------------------------------

describe('selectWorker — empty fleet', () => {
  it('returns null for an empty array', () => {
    expect(selectWorker([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// selectWorker — all workers unhealthy or at capacity
// ---------------------------------------------------------------------------

describe('selectWorker — no eligible workers', () => {
  it('returns null when the only worker is unhealthy', () => {
    const workers = [makeWorker('w1', 'unhealthy', 5, 0, 0)];
    expect(selectWorker(workers)).toBeNull();
  });

  it('returns null when the only worker is degraded', () => {
    const workers = [makeWorker('w1', 'degraded', 5, 0, 0)];
    expect(selectWorker(workers)).toBeNull();
  });

  it('returns null when the only healthy worker is at full capacity', () => {
    const workers = [makeWorker('w1', 'healthy', 5, 5, 0)];
    expect(selectWorker(workers)).toBeNull();
  });

  it('returns null when the only healthy worker is over capacity', () => {
    const workers = [makeWorker('w1', 'healthy', 5, 4, 3)];
    expect(selectWorker(workers)).toBeNull();
  });

  it('returns null when all workers are unhealthy', () => {
    const workers = [
      makeWorker('w1', 'unhealthy', 5, 0, 0),
      makeWorker('w2', 'degraded', 5, 0, 0),
      makeWorker('w3', 'unhealthy', 5, 2, 0),
    ];
    expect(selectWorker(workers)).toBeNull();
  });

  it('returns null when all healthy workers are at full capacity', () => {
    const workers = [makeWorker('w1', 'healthy', 5, 5, 0), makeWorker('w2', 'healthy', 3, 2, 1)];
    expect(selectWorker(workers)).toBeNull();
  });

  it('returns null when healthy workers have queued sessions consuming all capacity', () => {
    const workers = [makeWorker('w1', 'healthy', 5, 0, 5)];
    expect(selectWorker(workers)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// selectWorker — single eligible worker
// ---------------------------------------------------------------------------

describe('selectWorker — single eligible worker', () => {
  it('returns the only healthy worker with capacity', () => {
    const workers = [makeWorker('w1', 'healthy', 5, 2, 0)];
    const selected = selectWorker(workers);
    expect(selected).not.toBeNull();
    expect(selected?.name).toBe('w1');
  });

  it('returns the only eligible worker when others are unhealthy', () => {
    const workers = [
      makeWorker('w1', 'unhealthy', 5, 0, 0),
      makeWorker('w2', 'healthy', 5, 2, 0),
      makeWorker('w3', 'degraded', 5, 0, 0),
    ];
    const selected = selectWorker(workers);
    expect(selected?.name).toBe('w2');
  });

  it('returns the only eligible worker when others are at capacity', () => {
    const workers = [
      makeWorker('w1', 'healthy', 5, 5, 0),
      makeWorker('w2', 'healthy', 5, 3, 0),
      makeWorker('w3', 'healthy', 3, 3, 0),
    ];
    const selected = selectWorker(workers);
    expect(selected?.name).toBe('w2');
  });
});

// ---------------------------------------------------------------------------
// selectWorker — multiple eligible workers (load-based selection)
// ---------------------------------------------------------------------------

describe('selectWorker — least-loaded selection', () => {
  it('selects the worker with the most available capacity', () => {
    const workers = [
      makeWorker('w1', 'healthy', 5, 4, 0), // available = 1
      makeWorker('w2', 'healthy', 5, 1, 0), // available = 4
      makeWorker('w3', 'healthy', 5, 3, 0), // available = 2
    ];
    const selected = selectWorker(workers);
    expect(selected?.name).toBe('w2');
  });

  it('considers queued sessions when computing available capacity', () => {
    const workers = [
      makeWorker('w1', 'healthy', 10, 2, 0), // available = 8
      makeWorker('w2', 'healthy', 10, 0, 7), // available = 3
      makeWorker('w3', 'healthy', 10, 5, 1), // available = 4
    ];
    const selected = selectWorker(workers);
    expect(selected?.name).toBe('w1');
  });

  it('ignores unhealthy/degraded workers even when they have more capacity', () => {
    const workers = [
      makeWorker('w1', 'unhealthy', 10, 0, 0), // available = 10 but unhealthy
      makeWorker('w2', 'degraded', 10, 0, 0), // available = 10 but degraded
      makeWorker('w3', 'healthy', 5, 2, 0), // available = 3
    ];
    const selected = selectWorker(workers);
    expect(selected?.name).toBe('w3');
  });

  it('handles workers with different maxConcurrent values', () => {
    const workers = [
      makeWorker('small', 'healthy', 2, 1, 0), // available = 1
      makeWorker('large', 'healthy', 20, 15, 0), // available = 5
    ];
    const selected = selectWorker(workers);
    expect(selected?.name).toBe('large');
  });

  it('handles a single-slot idle worker', () => {
    const workers = [makeWorker('w1', 'healthy', 1, 0, 0)];
    const selected = selectWorker(workers);
    expect(selected?.name).toBe('w1');
    expect(workerAvailableCapacity(selected!)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// selectWorker — tie-breaking
// ---------------------------------------------------------------------------

describe('selectWorker — tie-breaking', () => {
  it('picks the first worker in the array when capacities are equal', () => {
    const workers = [
      makeWorker('w1', 'healthy', 5, 2, 0), // available = 3
      makeWorker('w2', 'healthy', 5, 2, 0), // available = 3
      makeWorker('w3', 'healthy', 5, 2, 0), // available = 3
    ];
    const selected = selectWorker(workers);
    expect(selected?.name).toBe('w1');
  });

  it('first-in-array wins on tie even if later workers have same capacity', () => {
    const workers = [
      makeWorker('alpha', 'healthy', 10, 5, 0), // available = 5
      makeWorker('beta', 'healthy', 10, 5, 0), // available = 5
    ];
    const selected = selectWorker(workers);
    expect(selected?.name).toBe('alpha');
  });

  it('first-in-array wins on tie only among eligible workers', () => {
    const workers = [
      makeWorker('w1', 'unhealthy', 5, 0, 0), // ineligible
      makeWorker('w2', 'healthy', 5, 2, 0), // available = 3 — first eligible
      makeWorker('w3', 'healthy', 5, 2, 0), // available = 3 — tied
    ];
    const selected = selectWorker(workers);
    expect(selected?.name).toBe('w2');
  });
});

// ---------------------------------------------------------------------------
// selectWorker — mixed realistic scenarios
// ---------------------------------------------------------------------------

describe('selectWorker — realistic fleet scenarios', () => {
  it('selects the correct worker in a realistic heterogeneous fleet', () => {
    const workers = [
      makeWorker('node-1', 'healthy', 5, 5, 0), // full
      makeWorker('node-2', 'unhealthy', 5, 0, 0), // unhealthy
      makeWorker('node-3', 'healthy', 5, 3, 1), // available = 1
      makeWorker('node-4', 'healthy', 5, 1, 0), // available = 4
      makeWorker('node-5', 'degraded', 5, 0, 0), // degraded
    ];
    const selected = selectWorker(workers);
    expect(selected?.name).toBe('node-4');
  });

  it('handles a fleet where all workers are idle', () => {
    const workers = [
      makeWorker('w1', 'healthy', 5, 0, 0), // available = 5
      makeWorker('w2', 'healthy', 5, 0, 0), // available = 5
    ];
    // Both have same capacity — first one wins
    const selected = selectWorker(workers);
    expect(selected?.name).toBe('w1');
  });

  it('handles a large fleet efficiently', () => {
    const workers: Worker[] = [];
    for (let i = 0; i < 100; i++) {
      workers.push(makeWorker(`w${i}`, 'healthy', 10, i % 10, 0));
    }
    // w0 has running=0, so available=10 — the most available
    const selected = selectWorker(workers);
    expect(selected?.name).toBe('w0');
    expect(workerAvailableCapacity(selected!)).toBe(10);
  });
});
