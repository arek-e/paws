import type { ResultAsync } from 'neverthrow';

/**
 * Status of a host node.
 *
 * - `provisioning` — being created/starting up
 * - `ready`        — running and accepting connections
 * - `deleting`     — being destroyed
 * - `error`        — in an unexpected/unrecoverable state
 */
export type HostStatus = 'provisioning' | 'ready' | 'deleting' | 'error';

/** A host node managed by a provider */
export interface Host {
  /** Provider-specific unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Current lifecycle status */
  status: HostStatus;
  /** Primary IPv4 address, if available */
  ipv4: string | null;
  /** Primary IPv6 address, if available */
  ipv6: string | null;
  /** Datacenter / region identifier */
  datacenter: string;
  /** Machine type / server type identifier */
  serverType: string;
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** Provider-specific metadata (arbitrary key-value pairs) */
  metadata: Record<string, string>;
}

/** Options for creating a new host */
export interface CreateHostOptions {
  name: string;
  serverType: string;
  location?: string;
  sshKeys?: string[];
  /** cloud-init user-data script */
  userData?: string;
}

/** Typed error for provider operations */
export const ProviderErrorCode = {
  NOT_FOUND: 'NOT_FOUND',
  API_ERROR: 'API_ERROR',
  CREATE_FAILED: 'CREATE_FAILED',
  DELETE_FAILED: 'DELETE_FAILED',
  LIST_FAILED: 'LIST_FAILED',
} as const;

export type ProviderErrorCode = (typeof ProviderErrorCode)[keyof typeof ProviderErrorCode];

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly cause?: unknown;

  constructor(code: ProviderErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.cause = cause;
  }
}

/** Interface all host providers must implement */
export interface HostProvider {
  /** List all hosts managed by this provider */
  listHosts(): ResultAsync<Host[], ProviderError>;
  /** Get a single host by ID. Returns NOT_FOUND error if not found. */
  getHost(id: string): ResultAsync<Host, ProviderError>;
  /** Create a new host and return it in provisioning status */
  createHost(options: CreateHostOptions): ResultAsync<Host, ProviderError>;
  /** Delete a host by ID. Resolves successfully even if already gone (idempotent). */
  deleteHost(id: string): ResultAsync<void, ProviderError>;
}
