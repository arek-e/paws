import { Gauge, Histogram, Registry } from 'prom-client';

import type { Executor } from './session/executor.js';
import type { Semaphore } from './semaphore.js';

export interface WorkerMetricsDeps {
  semaphore: Semaphore;
  executor: Executor;
  workerName: string;
}

export function createWorkerMetrics(deps: WorkerMetricsDeps) {
  const promRegistry = new Registry();
  promRegistry.setDefaultLabels({ service: 'worker', worker: deps.workerName });

  const startTime = Date.now();

  new Gauge({
    name: 'paws_worker_sessions_running',
    help: 'Currently running sessions on this worker',
    registers: [promRegistry],
    collect() {
      this.set(deps.semaphore.running);
    },
  });

  new Gauge({
    name: 'paws_worker_sessions_queued',
    help: 'Queued sessions waiting for a slot',
    registers: [promRegistry],
    collect() {
      this.set(deps.semaphore.queued);
    },
  });

  new Gauge({
    name: 'paws_worker_capacity_max',
    help: 'Maximum concurrent sessions',
    registers: [promRegistry],
    collect() {
      this.set(deps.semaphore.running + deps.semaphore.available);
    },
  });

  new Gauge({
    name: 'paws_worker_capacity_available',
    help: 'Available session slots',
    registers: [promRegistry],
    collect() {
      this.set(deps.semaphore.available);
    },
  });

  new Gauge({
    name: 'paws_worker_ip_pool_allocated',
    help: 'Allocated IP addresses from the pool',
    registers: [promRegistry],
    collect() {
      this.set(deps.executor.poolStats.allocated);
    },
  });

  new Gauge({
    name: 'paws_worker_ip_pool_available',
    help: 'Available IP addresses in the pool',
    registers: [promRegistry],
    collect() {
      this.set(deps.executor.poolStats.available);
    },
  });

  new Gauge({
    name: 'paws_worker_uptime_seconds',
    help: 'Worker uptime in seconds',
    registers: [promRegistry],
    collect() {
      this.set((Date.now() - startTime) / 1000);
    },
  });

  const sessionDuration = new Histogram({
    name: 'paws_worker_session_duration_seconds',
    help: 'Session execution duration on this worker',
    buckets: [1, 5, 10, 30, 60, 120, 300, 600],
    registers: [promRegistry],
  });

  return {
    promRegistry,
    sessionDuration,

    recordSessionDuration(durationMs: number) {
      sessionDuration.observe(durationMs / 1000);
    },
  };
}

export type WorkerMetrics = ReturnType<typeof createWorkerMetrics>;
