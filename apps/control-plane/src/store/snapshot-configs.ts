import type { SnapshotConfig } from '@paws/types';

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
