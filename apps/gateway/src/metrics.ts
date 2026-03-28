import { Counter, Gauge, Histogram, Registry } from 'prom-client';

import type { WorkerRegistry } from './discovery/registry.js';
import type { DaemonStore } from './store/daemons.js';
import type { SessionStore } from './store/sessions.js';

export interface MetricsDeps {
  sessionStore: SessionStore;
  daemonStore: DaemonStore;
  registry?: WorkerRegistry;
}

export function createGatewayMetrics(deps: MetricsDeps) {
  const promRegistry = new Registry();
  promRegistry.setDefaultLabels({ service: 'gateway' });

  // --- Gauges (read from stores on each scrape) ---

  const sessionsActive = new Gauge({
    name: 'paws_sessions_active',
    help: 'Number of pending or running sessions',
    registers: [promRegistry],
    collect() {
      this.set(deps.sessionStore.countActiveSessions());
    },
  });

  const workersTotal = new Gauge({
    name: 'paws_workers_total',
    help: 'Total registered workers',
    registers: [promRegistry],
    collect() {
      this.set(deps.registry?.count() ?? 0);
    },
  });

  const workersHealthy = new Gauge({
    name: 'paws_workers_healthy',
    help: 'Number of healthy workers',
    registers: [promRegistry],
    async collect() {
      if (!deps.registry) {
        this.set(0);
        return;
      }
      const workers = await deps.registry.getWorkers();
      this.set(workers.filter((w) => w.status === 'healthy').length);
    },
  });

  const fleetCapacityTotal = new Gauge({
    name: 'paws_fleet_capacity_total',
    help: 'Total concurrent VM capacity across all workers',
    registers: [promRegistry],
    async collect() {
      if (!deps.registry) {
        this.set(0);
        return;
      }
      const workers = await deps.registry.getWorkers();
      this.set(workers.reduce((sum, w) => sum + w.capacity.maxConcurrent, 0));
    },
  });

  const fleetCapacityUsed = new Gauge({
    name: 'paws_fleet_capacity_used',
    help: 'Currently used VM capacity across all workers',
    registers: [promRegistry],
    async collect() {
      if (!deps.registry) {
        this.set(0);
        return;
      }
      const workers = await deps.registry.getWorkers();
      this.set(workers.reduce((sum, w) => sum + w.capacity.running, 0));
    },
  });

  // --- Counters + Histograms (incremented on events) ---

  const sessionsTotal = new Counter({
    name: 'paws_sessions_total',
    help: 'Total sessions created',
    labelNames: ['status'] as const,
    registers: [promRegistry],
  });

  const sessionDuration = new Histogram({
    name: 'paws_session_duration_seconds',
    help: 'Session execution duration in seconds',
    buckets: [1, 5, 10, 30, 60, 120, 300, 600],
    registers: [promRegistry],
  });

  const httpRequestsTotal = new Counter({
    name: 'paws_http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'path', 'status'] as const,
    registers: [promRegistry],
  });

  const httpRequestDuration = new Histogram({
    name: 'paws_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'path'] as const,
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
    registers: [promRegistry],
  });

  return {
    promRegistry,
    sessionsActive,
    workersTotal,
    workersHealthy,
    fleetCapacityTotal,
    fleetCapacityUsed,
    sessionsTotal,
    sessionDuration,
    httpRequestsTotal,
    httpRequestDuration,

    /** Record a completed session */
    recordSession(status: string, durationMs?: number) {
      sessionsTotal.inc({ status });
      if (durationMs !== undefined) {
        sessionDuration.observe(durationMs / 1000);
      }
    },

    /** Record an HTTP request */
    recordRequest(method: string, path: string, status: number, durationMs: number) {
      // Normalize path to remove IDs
      const normalized = path
        .replace(/\/[0-9a-f-]{36}/g, '/:id')
        .replace(/\/build-[a-z0-9]+/g, '/:jobId');
      httpRequestsTotal.inc({ method, path: normalized, status: String(status) });
      httpRequestDuration.observe({ method, path: normalized }, durationMs / 1000);
    },
  };
}

export type GatewayMetrics = ReturnType<typeof createGatewayMetrics>;
