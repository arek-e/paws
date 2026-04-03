import { RuntimeError, RuntimeErrorCode } from './errors.js';
import type { RuntimeAdapter, RuntimeSessionRequest } from './types.js';

/** Registry for pluggable runtime adapters */
export interface RuntimeRegistry {
  /** Register a runtime adapter */
  register(adapter: RuntimeAdapter): void;

  /** Get a runtime by name */
  get(name: string): RuntimeAdapter | undefined;

  /**
   * Resolve the best runtime for a session request.
   * For now, returns the first (and likely only) registered runtime.
   * Future: select based on request requirements and runtime capabilities.
   */
  resolve(request?: RuntimeSessionRequest): RuntimeAdapter;

  /** List all registered runtimes */
  list(): RuntimeAdapter[];

  /** Dispose all registered runtimes */
  disposeAll(): Promise<void>;
}

/** Create a runtime registry */
export function createRuntimeRegistry(): RuntimeRegistry {
  const runtimes = new Map<string, RuntimeAdapter>();

  return {
    register(adapter) {
      runtimes.set(adapter.name, adapter);
    },

    get(name) {
      return runtimes.get(name);
    },

    resolve(_request) {
      const first = runtimes.values().next();
      if (first.done) {
        throw new RuntimeError(
          RuntimeErrorCode.NO_RUNTIME,
          'No runtime adapter registered. Configure at least one runtime (e.g., firecracker).',
        );
      }
      return first.value;
    },

    list() {
      return [...runtimes.values()];
    },

    async disposeAll() {
      const adapters = [...runtimes.values()];
      runtimes.clear();
      await Promise.allSettled(adapters.map((a) => a.dispose()));
    },
  };
}
