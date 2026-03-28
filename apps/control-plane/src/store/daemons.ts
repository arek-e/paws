import type { CreateDaemonRequest, DaemonStatus, Governance, Trigger, Workload } from '@paws/types';
import type { Resources, NetworkConfig } from '@paws/types';

export interface StoredDaemon {
  role: string;
  description: string;
  status: DaemonStatus;
  snapshot: string;
  trigger: Trigger;
  workload: Workload;
  resources?: Resources | undefined;
  network?: NetworkConfig | undefined;
  governance: Governance;
  createdAt: string;
  stats: {
    totalInvocations: number;
    lastInvokedAt?: string | undefined;
    totalDurationMs: number;
  };
}

export interface DaemonStore {
  create(request: CreateDaemonRequest): StoredDaemon;
  get(role: string): StoredDaemon | undefined;
  list(): StoredDaemon[];
  update(role: string, patch: Partial<StoredDaemon>): StoredDaemon | undefined;
  delete(role: string): boolean;
  recordInvocation(role: string, durationMs?: number): void;
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
        workload: request.workload,
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

    recordInvocation(role, durationMs) {
      const daemon = daemons.get(role);
      if (!daemon) return;
      daemon.stats.totalInvocations++;
      daemon.stats.lastInvokedAt = new Date().toISOString();
      if (durationMs !== undefined) {
        daemon.stats.totalDurationMs += durationMs;
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
