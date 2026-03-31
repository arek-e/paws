import { eq } from 'drizzle-orm';

import type { SnapshotConfig } from '@paws/domain-snapshot';

import type { PawsDatabase } from '../db/index.js';
import { snapshotConfigs as snapshotConfigsTable } from '../db/schema.js';

export interface SnapshotConfigStore {
  create(config: SnapshotConfig): SnapshotConfig;
  get(id: string): SnapshotConfig | undefined;
  list(): SnapshotConfig[];
  update(id: string, patch: Partial<SnapshotConfig>): SnapshotConfig | undefined;
  delete(id: string): boolean;
}

/** In-memory snapshot config store */
export function createSnapshotConfigStore(): SnapshotConfigStore {
  const configs = new Map<string, SnapshotConfig>();

  return {
    create(config) {
      const stored = { ...config };
      configs.set(config.id, stored);
      return { ...stored };
    },

    get(id) {
      const config = configs.get(id);
      return config ? { ...config } : undefined;
    },

    list() {
      return [...configs.values()];
    },

    update(id, patch) {
      const existing = configs.get(id);
      if (!existing) return undefined;
      const updated = { ...existing, ...patch, id }; // never change the id
      configs.set(id, updated);
      return updated;
    },

    delete(id) {
      return configs.delete(id);
    },
  };
}

type SnapshotConfigRow = typeof snapshotConfigsTable.$inferSelect;

function rowToSnapshotConfig(row: SnapshotConfigRow): SnapshotConfig {
  return {
    id: row.id,
    template: (row.template as SnapshotConfig['template']) ?? undefined,
    resources: (row.resources as SnapshotConfig['resources']) ?? undefined,
    setup: row.setup,
    requiredDomains: (row.requiredDomains as string[]) ?? [],
  };
}

/** SQLite-backed snapshot config store */
export function createSqliteSnapshotConfigStore(db: PawsDatabase): SnapshotConfigStore {
  return {
    create(config) {
      db.insert(snapshotConfigsTable)
        .values({
          id: config.id,
          template: config.template ?? null,
          resources: config.resources ?? null,
          setup: config.setup,
          requiredDomains: config.requiredDomains ?? [],
        })
        .run();
      return this.get(config.id)!;
    },

    get(id) {
      const row = db
        .select()
        .from(snapshotConfigsTable)
        .where(eq(snapshotConfigsTable.id, id))
        .get();
      return row ? rowToSnapshotConfig(row) : undefined;
    },

    list() {
      return db.select().from(snapshotConfigsTable).all().map(rowToSnapshotConfig);
    },

    update(id, patch) {
      const existing = this.get(id);
      if (!existing) return undefined;

      const values: Record<string, unknown> = {};
      if (patch.template !== undefined) values['template'] = patch.template;
      if (patch.resources !== undefined) values['resources'] = patch.resources;
      if (patch.setup !== undefined) values['setup'] = patch.setup;
      if (patch.requiredDomains !== undefined) values['requiredDomains'] = patch.requiredDomains;

      if (Object.keys(values).length > 0) {
        db.update(snapshotConfigsTable).set(values).where(eq(snapshotConfigsTable.id, id)).run();
      }
      return this.get(id);
    },

    delete(id) {
      const existing = this.get(id);
      if (!existing) return false;
      db.delete(snapshotConfigsTable).where(eq(snapshotConfigsTable.id, id)).run();
      return true;
    },
  };
}
