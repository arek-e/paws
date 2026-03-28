import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { DaemonStore, StoredDaemon } from './daemons.js';
import type { SessionStore, StoredSession } from './sessions.js';
import { createDaemonStore } from './daemons.js';
import { createSessionStore } from './sessions.js';

/** Wrap a daemon store with JSON file persistence */
export function createPersistentDaemonStore(filePath: string): DaemonStore {
  const inner = createDaemonStore();

  // Load existing state
  if (existsSync(filePath)) {
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf8')) as StoredDaemon[];
      for (const d of data) {
        // Re-create through the store to ensure proper state
        inner.create({
          role: d.role,
          description: d.description,
          snapshot: d.snapshot,
          trigger: d.trigger,
          workload: d.workload,
          resources: d.resources,
          network: d.network,
          governance: d.governance,
        });
        // Restore stats
        if (d.stats.totalInvocations > 0) {
          const stored = inner.get(d.role);
          if (stored) {
            stored.stats = d.stats;
          }
        }
      }
      console.log(`[store] Loaded ${data.length} daemons from ${filePath}`);
    } catch (err) {
      console.error(`[store] Failed to load daemons from ${filePath}:`, err);
    }
  }

  function save() {
    try {
      const dir = dirname(filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, JSON.stringify(inner.list(), null, 2));
    } catch (err) {
      console.error(`[store] Failed to save daemons:`, err);
    }
  }

  // Save periodically (every 30s) and on changes
  const saveTimer = setInterval(save, 30_000);
  if (typeof saveTimer.unref === 'function') saveTimer.unref();

  return {
    create(request) {
      const result = inner.create(request);
      save();
      return result;
    },
    get(role) {
      return inner.get(role);
    },
    list() {
      return inner.list();
    },
    update(role, patch) {
      const result = inner.update(role, patch);
      if (result) save();
      return result;
    },
    delete(role) {
      const result = inner.delete(role);
      if (result) save();
      return result;
    },
    recordInvocation(role, durationMs) {
      inner.recordInvocation(role, durationMs);
      // Don't save on every invocation (too frequent), periodic save handles it
    },
    countActive() {
      return inner.countActive();
    },
  };
}
