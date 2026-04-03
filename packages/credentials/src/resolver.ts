import type { CredentialStore } from './store.js';
import type { CredentialProvider } from './types.js';

/** Env var name conventions per provider */
const PROVIDER_ENV_NAMES: Record<CredentialProvider, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  github: ['GITHUB_TOKEN', 'GITHUB_PAT'],
};

/** Domain-to-provider mapping for auto-injection (exact matches only) */
const DOMAIN_PROVIDER_MAP: Record<string, CredentialProvider> = {
  'api.anthropic.com': 'anthropic',
  'api.openai.com': 'openai',
  'github.com': 'github',
};

/** How each provider's credential is injected as an HTTP header */
const PROVIDER_HEADER_CONFIG: Record<
  CredentialProvider,
  { headerName: string; headerTemplate: string }
> = {
  anthropic: { headerName: 'x-api-key', headerTemplate: '{value}' },
  openai: { headerName: 'Authorization', headerTemplate: 'Bearer {value}' },
  github: { headerName: 'Authorization', headerTemplate: 'Bearer {value}' },
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

  /**
   * Auto-inject credentials from the built-in store for allowlisted domains.
   * Only injects for exact domain-to-provider matches. Explicit credentials
   * in the input map are never overridden.
   */
  autoInject(
    allowOut: string[],
    explicitCredentials: Record<string, { headers: Record<string, string> }>,
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

    async autoInject(
      allowOut: string[],
      explicitCredentials: Record<string, { headers: Record<string, string> }>,
    ): Promise<Record<string, { headers: Record<string, string> }>> {
      const result = { ...explicitCredentials };

      for (const domain of allowOut) {
        if (result[domain]) continue; // explicit config wins

        const provider = DOMAIN_PROVIDER_MAP[domain];
        if (!provider) continue; // no known provider for this domain

        const value = await store.get(provider);
        if (!value) continue; // no credential stored for this provider

        const config = PROVIDER_HEADER_CONFIG[provider];
        const headerValue = config.headerTemplate.replace('{value}', value);
        result[domain] = { headers: { [config.headerName]: headerValue } };
      }

      return result;
    },
  };
}
