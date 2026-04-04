import { eq } from 'drizzle-orm';

import type { AgentConfig } from '@paws/domain-agent';
import type { CreateDaemonRequest, DaemonStatus, Trigger } from '@paws/domain-daemon';
import type { Governance } from '@paws/domain-policy';
import type { NetworkConfig } from '@paws/domain-network';
import type { Resources, Workload } from '@paws/domain-session';

import type { PawsDatabase } from '../db/index.js';
import { daemons as daemonsTable } from '../db/schema.js';

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

/** Row shape returned by Drizzle for the daemons table */
type DaemonRow = typeof daemonsTable.$inferSelect;

function rowToStoredDaemon(row: DaemonRow): StoredDaemon {
  return {
    role: row.role,
    description: row.description,
    status: row.status as DaemonStatus,
    snapshot: row.snapshot,
    trigger: row.trigger as Trigger,
    workload: (row.workload as Workload) ?? undefined,
    agent: (row.agent as AgentConfig) ?? undefined,
    resources: (row.resources as Resources) ?? undefined,
    network: (row.network as NetworkConfig) ?? undefined,
    governance: row.governance as Governance,
    createdAt: row.createdAt,
    stats: {
      totalInvocations: row.totalInvocations,
      lastInvokedAt: row.lastInvokedAt ?? undefined,
      totalDurationMs: row.totalDurationMs,
      totalVcpuSeconds: row.totalVcpuSeconds,
    },
  };
}

/** SQLite-backed daemon store */
export function createSqliteDaemonStore(db: PawsDatabase): DaemonStore {
  return {
    create(request) {
      const now = new Date().toISOString();
      const governance = request.governance ?? { requiresApproval: [], auditLog: true };
      db.insert(daemonsTable)
        .values({
          role: request.role,
          description: request.description ?? '',
          status: 'active',
          snapshot: request.snapshot,
          trigger: request.trigger,
          workload: request.workload ?? null,
          agent: request.agent ?? null,
          resources: request.resources ?? null,
          network: request.network ?? null,
          governance,
          createdAt: now,
        })
        .run();
      return this.get(request.role)!;
    },

    get(role) {
      const row = db.select().from(daemonsTable).where(eq(daemonsTable.role, role)).get();
      return row ? rowToStoredDaemon(row) : undefined;
    },

    list() {
      return db.select().from(daemonsTable).all().map(rowToStoredDaemon);
    },

    update(role, patch) {
      const existing = this.get(role);
      if (!existing) return undefined;

      const values: Record<string, unknown> = {};
      if (patch.description !== undefined) values['description'] = patch.description;
      if (patch.status !== undefined) values['status'] = patch.status;
      if (patch.snapshot !== undefined) values['snapshot'] = patch.snapshot;
      if (patch.trigger !== undefined) values['trigger'] = patch.trigger;
      if (patch.workload !== undefined) values['workload'] = patch.workload;
      if (patch.agent !== undefined) values['agent'] = patch.agent;
      if (patch.resources !== undefined) values['resources'] = patch.resources;
      if (patch.network !== undefined) values['network'] = patch.network;
      if (patch.governance !== undefined) values['governance'] = patch.governance;
      if (patch.stats !== undefined) {
        values['totalInvocations'] = patch.stats.totalInvocations;
        values['lastInvokedAt'] = patch.stats.lastInvokedAt ?? null;
        values['totalDurationMs'] = patch.stats.totalDurationMs;
        values['totalVcpuSeconds'] = patch.stats.totalVcpuSeconds;
      }

      if (Object.keys(values).length > 0) {
        db.update(daemonsTable).set(values).where(eq(daemonsTable.role, role)).run();
      }

      return this.get(role);
    },

    delete(role) {
      const existing = this.get(role);
      if (!existing) return false;
      db.delete(daemonsTable).where(eq(daemonsTable.role, role)).run();
      return true;
    },

    recordInvocation(role, durationMs, vcpuSeconds) {
      const existing = this.get(role);
      if (!existing) return;
      const now = new Date().toISOString();
      db.update(daemonsTable)
        .set({
          totalInvocations: existing.stats.totalInvocations + 1,
          lastInvokedAt: now,
          totalDurationMs: existing.stats.totalDurationMs + (durationMs ?? 0),
          totalVcpuSeconds: existing.stats.totalVcpuSeconds + (vcpuSeconds ?? 0),
        })
        .where(eq(daemonsTable.role, role))
        .run();
    },

    countActive() {
      return db.select().from(daemonsTable).where(eq(daemonsTable.status, 'active')).all().length;
    },
  };
}
