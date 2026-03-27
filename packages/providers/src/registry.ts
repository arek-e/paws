import type { HostProvider } from './provider.js';

/** Registry for looking up host providers by name */
export interface ProviderRegistry {
  /** Register a provider. Overwrites any existing provider with the same name. */
  register(provider: HostProvider): void;
  /** Get a provider by name, or null if not registered. */
  get(name: string): HostProvider | null;
  /** List all registered providers. */
  list(): HostProvider[];
}

/** Create a new empty provider registry */
export function createProviderRegistry(): ProviderRegistry {
  const providers = new Map<string, HostProvider>();

  return {
    register(provider: HostProvider): void {
      providers.set(provider.name, provider);
    },

    get(name: string): HostProvider | null {
      return providers.get(name) ?? null;
    },

    list(): HostProvider[] {
      return Array.from(providers.values());
    },
  };
}
