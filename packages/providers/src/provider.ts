import type { ResultAsync } from 'neverthrow';

import type { ProvidersError } from './errors.js';

/** Lifecycle status of a host */
export type HostStatus = 'provisioning' | 'ready' | 'error' | 'deleting' | 'deleted';

/** A physical or virtual host managed by a provider */
export interface Host {
  id: string;
  name: string;
  /** Provider name (e.g. "hetzner-dedicated", "hetzner-cloud") */
  provider: string;
  status: HostStatus;
  ipv4: string | null;
  ipv6: string | null;
  /** Datacenter or location identifier */
  region: string;
  /** Server type/size (e.g. "AX41-NVMe", "cx31") */
  plan: string;
  createdAt: Date;
  /** Provider-specific extras */
  metadata: Record<string, string>;
}

/** Options for provisioning a new host */
export interface CreateHostOpts {
  /** Hostname to assign */
  name: string;
  /** Datacenter/location */
  region: string;
  /** Server type */
  plan: string;
  /** SSH keys to inject */
  sshKeyIds?: string[];
  /** cloud-init / user-data script */
  userData?: string;
  metadata?: Record<string, string>;
}

/**
 * Contract that every host provider must satisfy.
 *
 * A provider manages a fleet of physical/virtual hosts. All fallible operations
 * return ResultAsync so callers can handle errors without exceptions.
 */
export interface HostProvider {
  /** Unique provider name — used as registry key (e.g. "hetzner-dedicated") */
  readonly name: string;

  /** Provision a new host and return it */
  createHost(opts: CreateHostOpts): ResultAsync<Host, ProvidersError>;

  /** Get current state of a host */
  getHost(hostId: string): ResultAsync<Host, ProvidersError>;

  /** List all hosts managed by this provider */
  listHosts(): ResultAsync<Host[], ProvidersError>;

  /** Delete/deprovision a host */
  deleteHost(hostId: string): ResultAsync<void, ProvidersError>;
}
