export type CredentialProvider = 'anthropic' | 'openai' | 'github';

export interface StoredCredential {
  provider: CredentialProvider;
  /** AES-256-GCM encrypted, base64 encoded: iv + ciphertext + authTag */
  encrypted: string;
  /** Masked display value, e.g. "sk-ant-...7f2a" */
  masked: string;
  /** Header name for proxy injection */
  headerName: string;
  /** Header value template (e.g. "Bearer {value}" or just "{value}") */
  headerTemplate: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaskedCredential {
  provider: CredentialProvider;
  masked: string;
  headerName: string;
  createdAt: string;
  updatedAt: string;
}
