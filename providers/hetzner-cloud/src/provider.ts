/**
 * Hetzner Cloud HostProvider implementation.
 *
 * NOTE: Hetzner Cloud VMs do NOT expose /dev/kvm. This provider is intended for
 * gateway/control-plane nodes only, NOT for worker nodes that run Firecracker VMs.
 * All hosts created by this provider include { firecrackerSupported: 'false' } in metadata.
 */

import { ResultAsync, okAsync } from 'neverthrow';

import { createHetznerCloudClient } from './client.js';
import type { FetchFn } from './client.js';
import type { CreateHostOptions, Host, HostProvider } from './provider-interface.js';
import { ProviderError } from './provider-interface.js';
import type { HetznerServer, HetznerServerStatus } from './types.js';

export interface HetznerCloudConfig {
  token: string;
  /** Base URL, defaults to https://api.hetzner.cloud/v1 */
  baseUrl?: string;
  /** Default image for new servers, defaults to "ubuntu-24.04" */
  defaultImage?: string;
  /** Injected fetch for testability */
  fetch?: FetchFn;
}

/**
 * Map a Hetzner server status to the canonical HostStatus.
 *
 * - running                           → ready
 * - initializing, starting, rebuilding → provisioning
 * - stopping, deleting                 → deleting
 * - off, migrating, unknown            → error
 */
function mapStatus(status: HetznerServerStatus): Host['status'] {
  switch (status) {
    case 'running':
      return 'ready';
    case 'initializing':
    case 'starting':
    case 'rebuilding':
      return 'provisioning';
    case 'stopping':
    case 'deleting':
      return 'deleting';
    case 'off':
    case 'migrating':
    case 'unknown':
      return 'error';
  }
}

function mapServer(server: HetznerServer): Host {
  return {
    id: String(server.id),
    name: server.name,
    status: mapStatus(server.status),
    // Hetzner Cloud VMs do NOT expose /dev/kvm — Firecracker is not supported.
    // Use hetzner-dedicated provider for bare-metal nodes with KVM access.
    ipv4: server.public_net.ipv4?.ip ?? null,
    ipv6: server.public_net.ipv6?.ip ?? null,
    datacenter: server.datacenter.name,
    serverType: server.server_type.name,
    createdAt: server.created,
    metadata: {
      firecrackerSupported: 'false',
    },
  };
}

/**
 * Create a Hetzner Cloud HostProvider.
 *
 * @param config - Provider configuration including API token.
 * @returns A HostProvider implementation backed by the Hetzner Cloud API.
 */
export function createHetznerCloudProvider(config: HetznerCloudConfig): HostProvider {
  const client = createHetznerCloudClient({
    token: config.token,
    ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
    ...(config.fetch !== undefined ? { fetch: config.fetch } : {}),
  });

  const defaultImage = config.defaultImage ?? 'ubuntu-24.04';

  return {
    listHosts() {
      return client.listServers().map((servers) => servers.map(mapServer));
    },

    getHost(id: string) {
      return client.getServer(id).map(mapServer);
    },

    createHost(options: CreateHostOptions) {
      return client
        .createServer({
          name: options.name,
          server_type: options.serverType,
          image: defaultImage,
          ...(options.location !== undefined ? { location: options.location } : {}),
          ...(options.sshKeys !== undefined ? { ssh_keys: options.sshKeys } : {}),
          ...(options.userData !== undefined ? { user_data: options.userData } : {}),
        })
        .map(mapServer);
    },

    deleteHost(id: string): ResultAsync<void, ProviderError> {
      // deleteServer returns false on 404 (already gone) — both outcomes are success
      return client.deleteServer(id).andThen(() => okAsync(undefined));
    },
  };
}
