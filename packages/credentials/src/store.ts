import { encrypt, decrypt, deriveKey } from './encryption.js';
import type { CredentialProvider, StoredCredential, MaskedCredential } from './types.js';

const PROVIDER_CONFIG: Record<
  CredentialProvider,
  { headerName: string; headerTemplate: string; prefixes: string[] }
> = {
  anthropic: { headerName: 'x-api-key', headerTemplate: '{value}', prefixes: ['sk-ant-'] },
  openai: { headerName: 'Authorization', headerTemplate: 'Bearer {value}', prefixes: ['sk-'] },
  github: {
    headerName: 'Authorization',
    headerTemplate: 'Bearer {value}',
    prefixes: ['ghp_', 'github_pat_'],
  },
};

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 6) + '...' + key.slice(-4);
}

export interface CredentialStore {
  upsert(provider: CredentialProvider, apiKey: string): Promise<void>;
  get(provider: CredentialProvider): Promise<string | undefined>;
  delete(provider: CredentialProvider): boolean;
  listMasked(): MaskedCredential[];
  /** Re-encrypt all credentials with a new key (for key rotation) */
  rotateKey(newSecret: string): Promise<void>;
  /** Get all stored credentials as raw data (for persistence) */
  serialize(): StoredCredential[];
  /** Load credentials from raw data (for persistence) */
  load(data: StoredCredential[]): void;
}

export function createCredentialStore(gatewaySecret: string): CredentialStore {
  let key: Buffer | null = null;
  const credentials = new Map<CredentialProvider, StoredCredential>();

  async function getKey(): Promise<Buffer> {
    if (!key) key = await deriveKey(gatewaySecret);
    return key;
  }

  return {
    async upsert(provider, apiKey) {
      const config = PROVIDER_CONFIG[provider];
      if (!config) throw new Error(`Unknown provider: ${provider}`);

      const k = await getKey();
      const now = new Date().toISOString();
      const existing = credentials.get(provider);

      credentials.set(provider, {
        provider,
        encrypted: encrypt(apiKey, k),
        masked: maskKey(apiKey),
        headerName: config.headerName,
        headerTemplate: config.headerTemplate,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    },

    async get(provider) {
      const cred = credentials.get(provider);
      if (!cred) return undefined;
      const k = await getKey();
      return decrypt(cred.encrypted, k);
    },

    delete(provider) {
      return credentials.delete(provider);
    },

    listMasked() {
      return Array.from(credentials.values()).map((c) => ({
        provider: c.provider,
        masked: c.masked,
        headerName: c.headerName,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));
    },

    async rotateKey(newSecret: string) {
      const oldKey = await getKey();
      const newKey = await deriveKey(newSecret);

      for (const [provider, cred] of credentials) {
        const plaintext = decrypt(cred.encrypted, oldKey);
        credentials.set(provider, {
          ...cred,
          encrypted: encrypt(plaintext, newKey),
          updatedAt: new Date().toISOString(),
        });
      }

      key = newKey;
    },

    serialize() {
      return Array.from(credentials.values());
    },

    load(data) {
      credentials.clear();
      for (const cred of data) {
        credentials.set(cred.provider, cred);
      }
    },
  };
}
