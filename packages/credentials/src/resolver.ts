import type { CredentialStore } from './store.js';
import type { CredentialProvider } from './types.js';

/** Env var name conventions per provider */
const PROVIDER_ENV_NAMES: Record<CredentialProvider, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  github: ['GITHUB_TOKEN', 'GITHUB_PAT'],
};

export class CredentialResolutionError extends Error {
  readonly code = 'CREDENTIAL_NOT_FOUND' as const;
  constructor(ref: string) {
    super(`Credential $${ref} not found in environment or credential store`);
  }
}

export interface ResolvedCredentialInfo {
  domain: string;
  source: 'environment' | 'credential-store' | 'auto-injected' | 'literal';
}

export interface CredentialResolver {
  /**
   * Resolve a single header value. If it starts with `$`, look up the
   * reference in process.env then the credential store. Otherwise pass through.
   */
  resolveValue(value: string): Promise<string>;

  /**
   * Resolve all `$REFERENCES` in a network credentials map and return
   * the resolved map with actual secret values.
   */
  resolveCredentials(
    credentials: Record<string, { headers: Record<string, string> }>,
  ): Promise<Record<string, { headers: Record<string, string> }>>;
}

export function createCredentialResolver(store: CredentialStore): CredentialResolver {
  async function resolveFromStore(ref: string): Promise<string | undefined> {
    // Check if the env var name matches a known provider convention
    for (const [provider, envNames] of Object.entries(PROVIDER_ENV_NAMES)) {
      if (envNames.includes(ref)) {
        const value = await store.get(provider as CredentialProvider);
        return value;
      }
    }
    return undefined;
  }

  return {
    async resolveValue(value: string): Promise<string> {
      if (!value.startsWith('$')) return value;

      const ref = value.slice(1);

      // 1. Check environment
      const envValue = process.env[ref];
      if (envValue) return envValue;

      // 2. Check built-in store
      const storeValue = await resolveFromStore(ref);
      if (storeValue) return storeValue;

      // 3. Fail
      throw new CredentialResolutionError(ref);
    },

    async resolveCredentials(
      credentials: Record<string, { headers: Record<string, string> }>,
    ): Promise<Record<string, { headers: Record<string, string> }>> {
      const resolved: Record<string, { headers: Record<string, string> }> = {};

      for (const [domain, cred] of Object.entries(credentials)) {
        const headers: Record<string, string> = {};
        for (const [headerName, headerValue] of Object.entries(cred.headers)) {
          headers[headerName] = await this.resolveValue(headerValue);
        }
        resolved[domain] = { headers };
      }

      return resolved;
    },
  };
}
