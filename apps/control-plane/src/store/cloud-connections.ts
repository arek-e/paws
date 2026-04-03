import { eq } from 'drizzle-orm';

import type { PawsDatabase } from '../db/index.js';
import { cloudConnections as table } from '../db/schema.js';

export interface CloudConnection {
  id: string;
  provider: 'aws-ec2';
  name: string;
  region: string;
  credentialsEncrypted: string;
  status: 'connected' | 'error';
  error?: string;
  lastSyncAt?: string;
  createdAt: string;
}

export interface CloudConnectionStore {
  create(conn: CloudConnection): void;
  get(id: string): CloudConnection | undefined;
  update(id: string, patch: Partial<CloudConnection>): CloudConnection | undefined;
  delete(id: string): boolean;
  list(): CloudConnection[];
  /** List connections for a specific provider */
  listByProvider(provider: string): CloudConnection[];
}

type Row = typeof table.$inferSelect;

function rowToConnection(row: Row): CloudConnection {
  return {
    id: row.id,
    provider: row.provider as CloudConnection['provider'],
    name: row.name,
    region: row.region,
    credentialsEncrypted: row.credentialsEncrypted,
    status: row.status as CloudConnection['status'],
    ...(row.error != null ? { error: row.error } : {}),
    ...(row.lastSyncAt != null ? { lastSyncAt: row.lastSyncAt } : {}),
    createdAt: row.createdAt,
  };
}

/** In-memory cloud connection store (for tests) */
export function createCloudConnectionStore(): CloudConnectionStore {
  const connections = new Map<string, CloudConnection>();

  return {
    create(conn) {
      connections.set(conn.id, conn);
    },
    get(id) {
      return connections.get(id);
    },
    update(id, patch) {
      const existing = connections.get(id);
      if (!existing) return undefined;
      const updated = { ...existing, ...patch };
      connections.set(id, updated);
      return updated;
    },
    delete(id) {
      return connections.delete(id);
    },
    list() {
      return Array.from(connections.values());
    },
    listByProvider(provider) {
      return this.list().filter((c) => c.provider === provider);
    },
  };
}

/** SQLite-backed cloud connection store */
export function createSqliteCloudConnectionStore(db: PawsDatabase): CloudConnectionStore {
  return {
    create(conn) {
      db.insert(table)
        .values({
          id: conn.id,
          provider: conn.provider,
          name: conn.name,
          region: conn.region,
          credentialsEncrypted: conn.credentialsEncrypted,
          status: conn.status,
          error: conn.error ?? null,
          lastSyncAt: conn.lastSyncAt ?? null,
          createdAt: conn.createdAt,
        })
        .run();
    },

    get(id) {
      const row = db.select().from(table).where(eq(table.id, id)).get();
      return row ? rowToConnection(row) : undefined;
    },

    update(id, patch) {
      const existing = this.get(id);
      if (!existing) return undefined;

      const values: Record<string, unknown> = {};
      if (patch.name !== undefined) values['name'] = patch.name;
      if (patch.region !== undefined) values['region'] = patch.region;
      if (patch.credentialsEncrypted !== undefined)
        values['credentialsEncrypted'] = patch.credentialsEncrypted;
      if (patch.status !== undefined) values['status'] = patch.status;
      if (patch.error !== undefined) values['error'] = patch.error;
      if (patch.lastSyncAt !== undefined) values['lastSyncAt'] = patch.lastSyncAt;

      if (Object.keys(values).length > 0) {
        db.update(table).set(values).where(eq(table.id, id)).run();
      }
      return this.get(id);
    },

    delete(id) {
      const existing = this.get(id);
      if (!existing) return false;
      db.delete(table).where(eq(table.id, id)).run();
      return true;
    },

    list() {
      return db.select().from(table).all().map(rowToConnection);
    },

    listByProvider(provider) {
      return db.select().from(table).where(eq(table.provider, provider)).all().map(rowToConnection);
    },
  };
}
