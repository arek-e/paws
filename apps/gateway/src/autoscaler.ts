import type { HostProvider } from '@paws/providers';

import type { WorkerRegistry } from './discovery/registry.js';

export interface AutoscalerConfig {
  provider: HostProvider;
  registry: WorkerRegistry;
  minWorkers: number;
  maxWorkers: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  scaleDownDelayMs: number;
  cooldownMs: number;
  pollIntervalMs: number;
  workerPlan: string;
  workerRegion: string;
  gatewayUrl: string;
  apiKey: string;
  sshKeyIds?: string[];
}

export interface ScaleEvent {
  type: 'up' | 'down';
  at: string;
  hostId?: string;
  reason: string;
}

export interface ScalingStatus {
  enabled: boolean;
  provider: string;
  minWorkers: number;
  maxWorkers: number;
  currentWorkers: number;
  utilization: number;
  lastScaleEvent: ScaleEvent | null;
  pendingProvisions: number;
  cooldownUntil: string | null;
}

export interface Autoscaler {
  start(): void;
  stop(): void;
  status(): ScalingStatus;
}

export function createAutoscaler(config: AutoscalerConfig): Autoscaler {
  const {
    provider,
    registry,
    minWorkers,
    maxWorkers,
    scaleUpThreshold,
    scaleDownThreshold,
    scaleDownDelayMs,
    cooldownMs,
    pollIntervalMs,
    workerPlan,
    workerRegion,
    gatewayUrl,
    apiKey,
    sshKeyIds,
  } = config;

  let timer: ReturnType<typeof setInterval> | null = null;
  let lastScaleEvent: ScaleEvent | null = null;
  let lastScaleTime = 0;
  let pendingProvisions = 0;
  let lowUtilSince = 0; // timestamp when utilization first dropped below threshold

  function computeUtilization(): {
    utilization: number;
    totalCapacity: number;
    totalRunning: number;
    totalQueued: number;
    workerCount: number;
  } {
    const workers = registry.getAll();
    let totalCapacity = 0;
    let totalRunning = 0;
    let totalQueued = 0;

    for (const w of workers) {
      totalCapacity += w.capacity.maxConcurrent;
      totalRunning += w.capacity.running;
      totalQueued += w.capacity.queued;
    }

    const utilization = totalCapacity > 0 ? totalRunning / totalCapacity : 0;
    return { utilization, totalCapacity, totalRunning, totalQueued, workerCount: workers.length };
  }

  function cooldownExpired(): boolean {
    return Date.now() - lastScaleTime >= cooldownMs;
  }

  function generateCloudInit(): string {
    return `#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# Install bun
curl -fsSL https://bun.sh/install | bash
export PATH=\$PATH:\$HOME/.bun/bin

# Clone and install paws
git clone https://github.com/arek-e/paws /opt/paws
cd /opt/paws
bun install

# Install Firecracker
scripts/install-firecracker.sh

# Start worker with call-home
GATEWAY_URL=${gatewayUrl} \\
API_KEY=${apiKey} \\
WORKER_NAME=worker-$(hostname) \\
WORKER_URL=http://$(curl -s http://169.254.169.254/hetzner/v1/metadata/public-ipv4):3000 \\
PORT=3000 \\
nohup bun run apps/worker/src/server.ts > /var/log/paws-worker.log 2>&1 &
`;
  }

  async function scaleUp(reason: string): Promise<void> {
    if (!cooldownExpired()) return;
    if (registry.count() + pendingProvisions >= maxWorkers) return;

    const name = `paws-worker-${Date.now()}`;
    console.log(`[autoscaler] Scaling UP: ${reason} → provisioning ${name}`);

    pendingProvisions++;
    lastScaleTime = Date.now();
    lastScaleEvent = { type: 'up', at: new Date().toISOString(), reason };

    const result = await provider.createHost({
      name,
      region: workerRegion,
      plan: workerPlan,
      sshKeyIds,
      userData: Buffer.from(generateCloudInit()).toString('base64'),
    });

    if (result.isOk()) {
      lastScaleEvent.hostId = result.value.id;
      console.log(`[autoscaler] Provisioned ${name} (${result.value.id})`);
    } else {
      console.error(`[autoscaler] Failed to provision ${name}:`, result.error.message);
    }

    pendingProvisions--;
  }

  async function scaleDown(reason: string): Promise<void> {
    if (!cooldownExpired()) return;
    if (registry.count() <= minWorkers) return;

    // Pick least-loaded worker
    const workers = registry.getAll();
    const sorted = [...workers].sort((a, b) => a.capacity.running - b.capacity.running);
    const candidate = sorted[0];
    if (!candidate) return;

    // Don't drain a worker that's still running sessions
    if (candidate.capacity.running > 0) return;

    console.log(`[autoscaler] Scaling DOWN: ${reason} → draining ${candidate.name}`);

    lastScaleTime = Date.now();
    lastScaleEvent = { type: 'down', at: new Date().toISOString(), reason };

    // Unregister so no new sessions get routed here
    registry.unregister(candidate.name);

    // Find the host in the provider and delete it
    const hosts = await provider.listHosts();
    if (hosts.isOk()) {
      // Match by IP in the worker URL
      const workerIp = new URL(candidate.url).hostname;
      const host = hosts.value.find((h) => h.ipv4 === workerIp || h.name.includes(candidate.name));
      if (host) {
        const deleteResult = await provider.deleteHost(host.id);
        if (deleteResult.isOk()) {
          lastScaleEvent.hostId = host.id;
          console.log(`[autoscaler] Deleted host ${host.id} (${host.name})`);
        } else {
          console.error(
            `[autoscaler] Failed to delete host ${host.id}:`,
            deleteResult.error.message,
          );
        }
      }
    }
  }

  async function evaluate(): Promise<void> {
    const { utilization, totalQueued, workerCount } = computeUtilization();

    // Scale UP: high utilization or queued sessions
    if (
      (utilization > scaleUpThreshold || totalQueued > 0) &&
      workerCount + pendingProvisions < maxWorkers
    ) {
      const reason =
        totalQueued > 0
          ? `${totalQueued} sessions queued`
          : `utilization ${(utilization * 100).toFixed(0)}% > ${(scaleUpThreshold * 100).toFixed(0)}%`;
      await scaleUp(reason);
      lowUtilSince = 0;
      return;
    }

    // Scale DOWN: low utilization for sustained period
    if (utilization < scaleDownThreshold && workerCount > minWorkers) {
      if (lowUtilSince === 0) {
        lowUtilSince = Date.now();
      } else if (Date.now() - lowUtilSince >= scaleDownDelayMs) {
        const reason = `utilization ${(utilization * 100).toFixed(0)}% < ${(scaleDownThreshold * 100).toFixed(0)}% for ${Math.round(scaleDownDelayMs / 60000)}min`;
        await scaleDown(reason);
        lowUtilSince = 0;
      }
    } else {
      lowUtilSince = 0;
    }
  }

  return {
    start() {
      console.log(
        `[autoscaler] Started (${provider.name}, ${minWorkers}-${maxWorkers} workers, poll ${pollIntervalMs}ms)`,
      );
      timer = setInterval(() => void evaluate(), pollIntervalMs);
      if (typeof timer.unref === 'function') timer.unref();
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      console.log('[autoscaler] Stopped');
    },

    status(): ScalingStatus {
      const { utilization, workerCount } = computeUtilization();
      const cooldownUntil = lastScaleTime + cooldownMs;
      return {
        enabled: true,
        provider: provider.name,
        minWorkers,
        maxWorkers,
        currentWorkers: workerCount,
        utilization,
        lastScaleEvent,
        pendingProvisions,
        cooldownUntil: cooldownUntil > Date.now() ? new Date(cooldownUntil).toISOString() : null,
      };
    },
  };
}
