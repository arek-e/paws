import { z } from 'zod';

/** Credential provider identifier (extensible — not a hardcoded enum) */
export const CredentialProviderSchema = z.string().min(1);

export type CredentialProvider = z.infer<typeof CredentialProviderSchema>;

/** Per-domain credential injection config (headers-based) */
export const DomainCredentialSchema = z.object({
  headers: z.record(z.string(), z.string()),
});

export type DomainCredential = z.infer<typeof DomainCredentialSchema>;

/** Credential injection type discriminator */
export const CredentialInjectionType = z.enum(['headers', 'oauth', 'mtls']);

export type CredentialInjectionType = z.infer<typeof CredentialInjectionType>;

/** Header-based credential injection */
export interface HeaderCredentialInjection {
  type: 'headers';
  headers: Record<string, string>;
}

/** OAuth token-based credential injection (future) */
export interface OAuthCredentialInjection {
  type: 'oauth';
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
}

/** Mutual TLS credential injection (future) */
export interface MtlsCredentialInjection {
  type: 'mtls';
  cert: string;
  key: string;
}

/** Polymorphic credential injection result */
export type CredentialInjection =
  | HeaderCredentialInjection
  | OAuthCredentialInjection
  | MtlsCredentialInjection;

/** Interface for transforming stored credentials into injection payloads */
export interface CredentialTransformer {
  /** Credential injection type this transformer produces */
  readonly type: CredentialInjectionType;
  /** Transform a stored credential value into an injection payload */
  transform(provider: string, value: string): CredentialInjection;
}
