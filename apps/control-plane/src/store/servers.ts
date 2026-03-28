import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Server } from '@paws/provisioner';

export interface ServerStore {
  create(server: Server): void;
  get(id: string): Server | undefined;
  update(id: string, patch: Partial<Server>): Server | undefined;
  delete(id: string): boolean;
  list(): Server[];
}

export function createServerStore(filePath?: string): ServerStore {
  const servers = new Map<string, Server>();

  // Load existing if filePath provided
  if (filePath && existsSync(filePath)) {
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf8')) as Server[];
      for (const s of data) servers.set(s.id, s);
    } catch {
      /* ignore corrupt data */
    }
  }

  function save() {
    if (!filePath) return;
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(Array.from(servers.values()), null, 2));
    renameSync(tmpPath, filePath);
  }

  return {
    create(server) {
      servers.set(server.id, server);
      save();
    },
    get(id) {
      return servers.get(id);
    },
    update(id, patch) {
      const existing = servers.get(id);
      if (!existing) return undefined;
      const updated = { ...existing, ...patch };
      servers.set(id, updated);
      save();
      return updated;
    },
    delete(id) {
      const result = servers.delete(id);
      if (result) save();
      return result;
    },
    list() {
      return Array.from(servers.values());
    },
  };
}
