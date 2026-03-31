import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface AuditEvent {
  id: string;
  timestamp: string;
  category: 'session' | 'daemon' | 'server' | 'auth' | 'system';
  action: string;
  actor?: string | undefined;
  resourceType?: string | undefined;
  resourceId?: string | undefined;
  details?: Record<string, unknown> | undefined;
  severity: 'info' | 'warn' | 'error';
}

export interface AuditQueryOpts {
  category?: string | undefined;
  action?: string | undefined;
  resourceType?: string | undefined;
  resourceId?: string | undefined;
  severity?: string | undefined;
  search?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  since?: string | undefined;
  until?: string | undefined;
}

export interface AuditStore {
  append(event: Omit<AuditEvent, 'id' | 'timestamp'>): AuditEvent;
  query(opts: AuditQueryOpts): { events: AuditEvent[]; total: number };
  stats(): {
    last24h: Record<string, number>;
    last7d: Record<string, number>;
    total: number;
  };
}

const MAX_EVENTS = 10_000;

export function createAuditStore(filePath?: string): AuditStore {
  const events: AuditEvent[] = [];

  if (filePath && existsSync(filePath)) {
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf8')) as AuditEvent[];
      const sliced = data.slice(-MAX_EVENTS);
      events.push(...sliced);
    } catch {
      /* ignore corrupt data */
    }
  }

  function save() {
    if (!filePath) return;
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(events, null, 2));
    renameSync(tmpPath, filePath);
  }

  return {
    append(input) {
      const event: AuditEvent = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        ...input,
      };

      events.push(event);

      if (events.length > MAX_EVENTS) {
        events.splice(0, events.length - MAX_EVENTS);
      }

      save();
      return event;
    },

    query(opts) {
      let filtered = events;

      if (opts.category) {
        filtered = filtered.filter((e) => e.category === opts.category);
      }
      if (opts.action) {
        filtered = filtered.filter((e) => e.action === opts.action);
      }
      if (opts.resourceType) {
        filtered = filtered.filter((e) => e.resourceType === opts.resourceType);
      }
      if (opts.resourceId) {
        filtered = filtered.filter((e) => e.resourceId === opts.resourceId);
      }
      if (opts.severity) {
        filtered = filtered.filter((e) => e.severity === opts.severity);
      }
      if (opts.since) {
        const since = opts.since;
        filtered = filtered.filter((e) => e.timestamp >= since);
      }
      if (opts.until) {
        const until = opts.until;
        filtered = filtered.filter((e) => e.timestamp <= until);
      }
      if (opts.search) {
        const term = opts.search.toLowerCase();
        filtered = filtered.filter(
          (e) =>
            e.action.toLowerCase().includes(term) ||
            (e.actor && e.actor.toLowerCase().includes(term)) ||
            (e.resourceId && e.resourceId.toLowerCase().includes(term)) ||
            (e.details && JSON.stringify(e.details).toLowerCase().includes(term)),
        );
      }

      const total = filtered.length;
      const sorted = [...filtered].reverse();
      const offset = opts.offset ?? 0;
      const limit = opts.limit ?? 50;
      const paged = sorted.slice(offset, offset + limit);

      return { events: paged, total };
    },

    stats() {
      const now = Date.now();
      const h24 = now - 24 * 60 * 60 * 1000;
      const d7 = now - 7 * 24 * 60 * 60 * 1000;

      const last24h: Record<string, number> = {};
      const last7d: Record<string, number> = {};

      for (const e of events) {
        const ts = new Date(e.timestamp).getTime();
        if (ts >= d7) {
          last7d[e.category] = (last7d[e.category] ?? 0) + 1;
        }
        if (ts >= h24) {
          last24h[e.category] = (last24h[e.category] ?? 0) + 1;
        }
      }

      return { last24h, last7d, total: events.length };
    },
  };
}
