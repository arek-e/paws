import { describe, expect, it } from 'vitest';

import { ProvidersErrorCode } from '@paws/providers';
import type { CreateHostOpts } from '@paws/providers';

import type { FetchFn } from './client.js';
import { createHetznerDedicatedProvider } from './provider.js';
import type {
  HetznerOrderTransactionWrapper,
  HetznerServerListResponse,
  HetznerServerWrapper,
} from './types.js';

function makeServerWrapper(
  overrides: Partial<HetznerServerWrapper['server']> = {},
): HetznerServerWrapper {
  return {
    server: {
      server_number: 12345,
      server_name: 'paws-node-1',
      server_ip: '1.2.3.4',
      server_ipv6_net: '2a01::/64',
      dc: 'FSN1-DC14',
      product: 'AX41-NVMe',
      status: 'ready',
      cancelled: false,
      paid_until: '2025-06-01',
      ...overrides,
    },
  };
}

function makeFetch(status: number, body: unknown): FetchFn {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
}

function makeProvider(fetchFn: FetchFn) {
  return createHetznerDedicatedProvider({
    username: 'user',
    password: 'pass',
    fetch: fetchFn,
  });
}

describe('createHetznerDedicatedProvider', () => {
  it('has name "hetzner-dedicated"', () => {
    const provider = makeProvider(makeFetch(200, []));
    expect(provider.name).toBe('hetzner-dedicated');
  });

  describe('listHosts', () => {
    it('maps server list to Host array', async () => {
      const serverList: HetznerServerListResponse = [
        makeServerWrapper({
          server_number: 1,
          server_name: 'node-1',
          server_ip: '10.0.0.1',
          status: 'ready',
        }),
        makeServerWrapper({
          server_number: 2,
          server_name: 'node-2',
          server_ip: '10.0.0.2',
          status: 'in process',
        }),
      ];
      const provider = makeProvider(makeFetch(200, serverList));

      const result = await provider.listHosts();
      expect(result.isOk()).toBe(true);
      const hosts = result._unsafeUnwrap();
      expect(hosts).toHaveLength(2);
      expect(hosts[0]?.id).toBe('1');
      expect(hosts[0]?.name).toBe('node-1');
      expect(hosts[0]?.status).toBe('ready');
      expect(hosts[0]?.provider).toBe('hetzner-dedicated');
      expect(hosts[1]?.status).toBe('provisioning');
    });

    it('maps FSN1 datacenter to fsn1 region', async () => {
      const serverList: HetznerServerListResponse = [makeServerWrapper({ dc: 'FSN1-DC14' })];
      const provider = makeProvider(makeFetch(200, serverList));

      const result = await provider.listHosts();
      expect(result._unsafeUnwrap()[0]?.region).toBe('fsn1');
    });

    it('maps NBG1 datacenter to nbg1 region', async () => {
      const serverList: HetznerServerListResponse = [makeServerWrapper({ dc: 'NBG1-DC3' })];
      const provider = makeProvider(makeFetch(200, serverList));

      const result = await provider.listHosts();
      expect(result._unsafeUnwrap()[0]?.region).toBe('nbg1');
    });

    it('maps HEL1 datacenter to hel1 region', async () => {
      const serverList: HetznerServerListResponse = [makeServerWrapper({ dc: 'HEL1-DC1' })];
      const provider = makeProvider(makeFetch(200, serverList));

      const result = await provider.listHosts();
      expect(result._unsafeUnwrap()[0]?.region).toBe('hel1');
    });

    it('returns err on API failure', async () => {
      const provider = makeProvider(
        makeFetch(500, { error: { status: 500, code: 'ERR', message: 'oops' } }),
      );

      const result = await provider.listHosts();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(ProvidersErrorCode.API_ERROR);
    });

    it('returns empty array when no servers', async () => {
      const provider = makeProvider(makeFetch(200, []));

      const result = await provider.listHosts();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toHaveLength(0);
    });
  });

  describe('getHost', () => {
    it('returns a Host on success', async () => {
      const wrapper = makeServerWrapper({ server_number: 42, server_name: 'paws-42' });
      const provider = makeProvider(makeFetch(200, wrapper));

      const result = await provider.getHost('42');
      expect(result.isOk()).toBe(true);
      const host = result._unsafeUnwrap();
      expect(host.id).toBe('42');
      expect(host.name).toBe('paws-42');
      expect(host.plan).toBe('AX41-NVMe');
    });

    it('includes server number in metadata', async () => {
      const wrapper = makeServerWrapper({ server_number: 42 });
      const provider = makeProvider(makeFetch(200, wrapper));

      const result = await provider.getHost('42');
      expect(result._unsafeUnwrap().metadata['serverNumber']).toBe('42');
    });

    it('returns HOST_NOT_FOUND on 404', async () => {
      const provider = makeProvider(makeFetch(404, {}));

      const result = await provider.getHost('9999');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(ProvidersErrorCode.HOST_NOT_FOUND);
    });

    it('returns HOST_NOT_FOUND for non-numeric hostId', async () => {
      const provider = makeProvider(makeFetch(200, {}));

      const result = await provider.getHost('not-a-number');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(ProvidersErrorCode.HOST_NOT_FOUND);
    });
  });

  describe('createHost', () => {
    const opts: CreateHostOpts = {
      name: 'paws-new',
      region: 'FSN1',
      plan: 'AX41-NVMe',
      sshKeyIds: ['fp:ab:cd:ef'],
    };

    it('returns a provisioning Host with transaction metadata', async () => {
      const txResponse: HetznerOrderTransactionWrapper = {
        transaction: {
          id: 'tx-xyz',
          date: '2025-01-15T12:00:00Z',
          status: 'in progress',
          server_number: null,
        },
      };
      const provider = makeProvider(makeFetch(201, txResponse));

      const result = await provider.createHost(opts);
      expect(result.isOk()).toBe(true);
      const host = result._unsafeUnwrap();
      expect(host.status).toBe('provisioning');
      expect(host.name).toBe('paws-new');
      expect(host.region).toBe('FSN1');
      expect(host.plan).toBe('AX41-NVMe');
      expect(host.metadata['transactionId']).toBe('tx-xyz');
      expect(host.ipv4).toBeNull();
    });

    it('returns PROVISION_FAILED on API error', async () => {
      const provider = makeProvider(
        makeFetch(422, { error: { status: 422, code: 'INVALID', message: 'bad product' } }),
      );

      const result = await provider.createHost(opts);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(ProvidersErrorCode.PROVISION_FAILED);
    });
  });

  describe('deleteHost', () => {
    it('returns Ok(void) on success', async () => {
      const provider = makeProvider(makeFetch(200, {}));

      const result = await provider.deleteHost('12345');
      expect(result.isOk()).toBe(true);
    });

    it('returns HOST_NOT_FOUND on 404', async () => {
      const provider = makeProvider(makeFetch(404, {}));

      const result = await provider.deleteHost('9999');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(ProvidersErrorCode.HOST_NOT_FOUND);
    });

    it('returns HOST_NOT_FOUND for non-numeric hostId', async () => {
      const provider = makeProvider(makeFetch(200, {}));

      const result = await provider.deleteHost('not-a-number');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(ProvidersErrorCode.HOST_NOT_FOUND);
    });
  });

  describe('Host field mapping', () => {
    it('maps server_ip to ipv4', async () => {
      const wrapper = makeServerWrapper({ server_ip: '5.6.7.8' });
      const provider = makeProvider(makeFetch(200, wrapper));

      const result = await provider.getHost('12345');
      expect(result._unsafeUnwrap().ipv4).toBe('5.6.7.8');
    });

    it('maps server_ipv6_net to ipv6', async () => {
      const wrapper = makeServerWrapper({ server_ipv6_net: '2a01:4f8::/64' });
      const provider = makeProvider(makeFetch(200, wrapper));

      const result = await provider.getHost('12345');
      expect(result._unsafeUnwrap().ipv6).toBe('2a01:4f8::/64');
    });

    it('sets ipv4 to null when server_ip is empty string', async () => {
      const wrapper = makeServerWrapper({ server_ip: '' });
      const provider = makeProvider(makeFetch(200, wrapper));

      const result = await provider.getHost('12345');
      expect(result._unsafeUnwrap().ipv4).toBeNull();
    });
  });
});
