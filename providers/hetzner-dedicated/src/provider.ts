import { ResultAsync, errAsync } from 'neverthrow';

import { ProvidersError, ProvidersErrorCode } from '@paws/providers';
import type { CreateHostOpts, Host, HostProvider, HostStatus } from '@paws/providers';

import type { FetchFn, HetznerDedicatedClientOptions } from './client.js';
import { createHetznerRobotClient } from './client.js';
import type { HetznerOrderServerRequest, HetznerServer } from './types.js';
import { datacenterToRegion } from './types.js';

export interface HetznerDedicatedConfig {
  username: string;
  password: string;
  /** Base URL, defaults to https://robot-ws.your-server.de */
  baseUrl?: string;
  /** Injected fetch for testability */
  fetch?: FetchFn;
}

/** Map Hetzner server status to HostStatus */
function toHostStatus(status: HetznerServer['status']): HostStatus {
  switch (status) {
    case 'ready':
      return 'ready';
    case 'in process':
      return 'provisioning';
  }
}

/** Map a Hetzner server object to a Host */
function toHost(server: HetznerServer): Host {
  return {
    id: String(server.server_number),
    name: server.server_name,
    provider: 'hetzner-dedicated',
    status: toHostStatus(server.status),
    ipv4: server.server_ip || null,
    ipv6: server.server_ipv6_net || null,
    region: datacenterToRegion(server.dc),
    plan: server.product,
    createdAt: new Date(server.paid_until),
    metadata: {
      serverNumber: String(server.server_number),
      datacenter: server.dc,
    },
  };
}

/**
 * Create a HostProvider backed by the Hetzner Robot API (dedicated servers).
 *
 * All network calls use the injected `fetch` function — pass a mock for tests.
 */
export function createHetznerDedicatedProvider(config: HetznerDedicatedConfig): HostProvider {
  const clientOpts: HetznerDedicatedClientOptions = {
    username: config.username,
    password: config.password,
  };
  if (config.baseUrl !== undefined) clientOpts.baseUrl = config.baseUrl;
  if (config.fetch !== undefined) clientOpts.fetch = config.fetch;
  const client = createHetznerRobotClient(clientOpts);

  return {
    name: 'hetzner-dedicated',

    listHosts(): ResultAsync<Host[], ProvidersError> {
      return client.listServers().map((servers) => servers.map((w) => toHost(w.server)));
    },

    getHost(hostId: string): ResultAsync<Host, ProvidersError> {
      const serverNumber = parseInt(hostId, 10);
      if (isNaN(serverNumber)) {
        return errAsync(
          new ProvidersError(
            ProvidersErrorCode.HOST_NOT_FOUND,
            `Invalid host ID (expected numeric server number): ${hostId}`,
          ),
        );
      }
      return client.getServer(serverNumber).map((w) => toHost(w.server));
    },

    createHost(opts: CreateHostOpts): ResultAsync<Host, ProvidersError> {
      const orderRequest: HetznerOrderServerRequest = {
        product_id: opts.plan,
        location: opts.region,
        hostname: opts.name,
      };
      if (opts.sshKeyIds !== undefined) orderRequest.authorized_key = opts.sshKeyIds;

      return client
        .orderServer(orderRequest)
        .map(
          (w): Host => ({
            id: w.transaction.id,
            name: opts.name,
            provider: 'hetzner-dedicated',
            status: 'provisioning',
            ipv4: null,
            ipv6: null,
            region: opts.region,
            plan: opts.plan,
            createdAt: new Date(w.transaction.date),
            metadata: {
              transactionId: w.transaction.id,
              transactionStatus: w.transaction.status,
            },
          }),
        )
        .mapErr(
          (e) =>
            new ProvidersError(
              ProvidersErrorCode.PROVISION_FAILED,
              `Failed to order Hetzner dedicated server: ${e.message}`,
              e,
            ),
        );
    },

    deleteHost(hostId: string): ResultAsync<void, ProvidersError> {
      const serverNumber = parseInt(hostId, 10);
      if (isNaN(serverNumber)) {
        return errAsync(
          new ProvidersError(
            ProvidersErrorCode.HOST_NOT_FOUND,
            `Invalid host ID (expected numeric server number): ${hostId}`,
          ),
        );
      }
      return client.deleteServer(serverNumber);
    },
  };
}
