import type { AgentConfig } from '@paws/domain-agent';
import type { NetworkConfig } from '@paws/domain-network';
import type { Governance } from '@paws/domain-policy';
import type { Resources, Workload } from '@paws/domain-session';
import type { CreateDaemonRequest, DaemonStatus, Trigger } from './types.js';

export interface StoredDaemon {
  role: string;
  description: string;
  status: DaemonStatus;
  snapshot: string;
  trigger: Trigger;
  workspace?: string | undefined;
  workload?: Workload | undefined;
  agent?: AgentConfig | undefined;
  resources?: Resources | undefined;
  network?: NetworkConfig | undefined;
  governance: Governance;
  createdAt: string;
  stats: {
    totalInvocations: number;
    lastInvokedAt?: string | undefined;
    totalDurationMs: number;
    totalVcpuSeconds: number;
  };
}

export interface DaemonStore {
  create(request: CreateDaemonRequest): StoredDaemon;
  get(role: string): StoredDaemon | undefined;
  list(): StoredDaemon[];
  update(role: string, patch: Partial<StoredDaemon>): StoredDaemon | undefined;
  delete(role: string): boolean;
  recordInvocation(role: string, durationMs?: number, vcpuSeconds?: number): void;
  countActive(): number;
}

/** In-memory daemon store for v0.1 */
export function createDaemonStore(): DaemonStore {
  const daemons = new Map<string, StoredDaemon>();

  return {
    create(request) {
      const daemon: StoredDaemon = {
        role: request.role,
        description: request.description ?? '',
        status: 'active',
        snapshot: request.snapshot,
        trigger: request.trigger,
        workspace: request.workspace,
        workload: request.workload,
        agent: request.agent,
        resources: request.resources,
        network: request.network,
        governance: request.governance ?? {
          requiresApproval: [],
          auditLog: true,
        },
        createdAt: new Date().toISOString(),
        stats: {
          totalInvocations: 0,
          totalDurationMs: 0,
          totalVcpuSeconds: 0,
        },
      };
      daemons.set(request.role, daemon);
      return daemon;
    },

    get(role) {
      return daemons.get(role);
    },

    list() {
      return [...daemons.values()];
    },

    update(role, patch) {
      const daemon = daemons.get(role);
      if (!daemon) return undefined;
      Object.assign(daemon, patch);
      return daemon;
    },

    delete(role) {
      const daemon = daemons.get(role);
      if (!daemon) return false;
      daemon.status = 'stopped';
      daemons.delete(role);
      return true;
    },

    recordInvocation(role, durationMs, vcpuSeconds) {
      const daemon = daemons.get(role);
      if (!daemon) return;
      daemon.stats.totalInvocations++;
      daemon.stats.lastInvokedAt = new Date().toISOString();
      if (durationMs !== undefined) {
        daemon.stats.totalDurationMs += durationMs;
      }
      if (vcpuSeconds !== undefined) {
        daemon.stats.totalVcpuSeconds += vcpuSeconds;
      }
    },

    countActive() {
      let count = 0;
      for (const daemon of daemons.values()) {
        if (daemon.status === 'active') count++;
      }
      return count;
    },
  };
}
