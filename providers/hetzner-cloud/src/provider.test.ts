import { describe, expect, it } from 'vitest';

import type { FetchFn } from './client.js';
import { ProviderErrorCode } from './provider-interface.js';
import { createHetznerCloudProvider } from './provider.js';
import type { HetznerServer } from './types.js';

const TOKEN = 'test-token';
const BASE_URL = 'https://api.hetzner.cloud/v1';

function makeServer(overrides: Partial<HetznerServer> = {}): HetznerServer {
  return {
    id: 1,
    name: 'paws-gateway-1',
    status: 'running',
    created: '2024-06-01T10:00:00Z',
    public_net: {
      ipv4: { ip: '65.21.0.1' },
      ipv6: { ip: '2a01:4f9::1' },
    },
    datacenter: { name: 'fsn1-dc14' },
    server_type: { name: 'cx31' },
    ...overrides,
  };
}

function mockFetch(responses: Array<{ status: number; body: unknown }>): FetchFn {
  let call = 0;
  return async (_input, _init) => {
    const resp = responses[call++] ?? { status: 500, body: {} };
    if (resp.body === null || resp.status === 204) {
      return new Response(null, { status: resp.status });
    }
    return new Response(JSON.stringify(resp.body), { status: resp.status });
  };
}

describe('createHetznerCloudProvider', () => {
  describe('listHosts', () => {
    it('returns mapped Host list', async () => {
      const server = makeServer({ id: 10, name: 'my-node', status: 'running' });
      const fetch = mockFetch([{ status: 200, body: { servers: [server] } }]);
      const provider = createHetznerCloudProvider({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await provider.listHosts();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const [host] = result.value;
        expect(host?.id).toBe('10');
        expect(host?.name).toBe('my-node');
        expect(host?.status).toBe('ready');
        expect(host?.ipv4).toBe('65.21.0.1');
        expect(host?.ipv6).toBe('2a01:4f9::1');
        expect(host?.datacenter).toBe('fsn1-dc14');
        expect(host?.serverType).toBe('cx31');
        expect(host?.createdAt).toBe('2024-06-01T10:00:00Z');
        // Firecracker is NOT supported on Hetzner Cloud VMs
        expect(host?.metadata['firecrackerSupported']).toBe('false');
      }
    });

    it('returns error when API fails', async () => {
      const fetch = mockFetch([{ status: 403, body: { error: { code: 'forbidden' } } }]);
      const provider = createHetznerCloudProvider({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await provider.listHosts();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.LIST_FAILED);
      }
    });
  });

  describe('getHost', () => {
    it('returns mapped Host on success', async () => {
      const server = makeServer({ id: 42, name: 'gateway-node', status: 'running' });
      const fetch = mockFetch([{ status: 200, body: { server } }]);
      const provider = createHetznerCloudProvider({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await provider.getHost('42');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe('42');
        expect(result.value.name).toBe('gateway-node');
        expect(result.value.status).toBe('ready');
      }
    });

    it('returns NOT_FOUND error on 404', async () => {
      const fetch = mockFetch([{ status: 404, body: { error: { code: 'not_found' } } }]);
      const provider = createHetznerCloudProvider({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await provider.getHost('9999');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.NOT_FOUND);
      }
    });
  });

  describe('createHost', () => {
    it('returns provisioning host on successful creation', async () => {
      const server = makeServer({ id: 55, name: 'new-gateway', status: 'initializing' });
      const fetch = mockFetch([{ status: 201, body: { server } }]);
      const provider = createHetznerCloudProvider({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await provider.createHost({
        name: 'new-gateway',
        serverType: 'cx31',
        location: 'fsn1',
        sshKeys: ['my-key'],
        userData: '#!/bin/bash\nbun install',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe('55');
        expect(result.value.name).toBe('new-gateway');
        // initializing maps to provisioning
        expect(result.value.status).toBe('provisioning');
        expect(result.value.metadata['firecrackerSupported']).toBe('false');
      }
    });

    it('uses defaultImage from config', async () => {
      let capturedBody: unknown;
      const fetchFn: FetchFn = async (_input, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ server: makeServer({ status: 'initializing' }) }), {
          status: 201,
        });
      };
      const provider = createHetznerCloudProvider({
        token: TOKEN,
        baseUrl: BASE_URL,
        defaultImage: 'debian-12',
        fetch: fetchFn,
      });

      await provider.createHost({ name: 'n', serverType: 'cx21' });

      expect((capturedBody as { image: string }).image).toBe('debian-12');
    });

    it('falls back to ubuntu-24.04 when no defaultImage configured', async () => {
      let capturedBody: unknown;
      const fetchFn: FetchFn = async (_input, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ server: makeServer({ status: 'initializing' }) }), {
          status: 201,
        });
      };
      const provider = createHetznerCloudProvider({
        token: TOKEN,
        baseUrl: BASE_URL,
        fetch: fetchFn,
      });

      await provider.createHost({ name: 'n', serverType: 'cx21' });

      expect((capturedBody as { image: string }).image).toBe('ubuntu-24.04');
    });

    it('returns CREATE_FAILED error on non-2xx response', async () => {
      const fetch = mockFetch([{ status: 422, body: { error: { code: 'invalid_input' } } }]);
      const provider = createHetznerCloudProvider({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await provider.createHost({ name: 'bad', serverType: 'cx31' });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.CREATE_FAILED);
      }
    });
  });

  describe('deleteHost', () => {
    it('resolves on successful deletion (204)', async () => {
      const fetch = mockFetch([{ status: 204, body: null }]);
      const provider = createHetznerCloudProvider({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await provider.deleteHost('1');

      expect(result.isOk()).toBe(true);
    });

    it('resolves successfully on 404 (idempotent — already gone)', async () => {
      const fetch = mockFetch([{ status: 404, body: { error: { code: 'not_found' } } }]);
      const provider = createHetznerCloudProvider({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await provider.deleteHost('999');

      expect(result.isOk()).toBe(true);
    });

    it('returns DELETE_FAILED error on server error', async () => {
      const fetch = mockFetch([{ status: 500, body: { error: { code: 'internal_error' } } }]);
      const provider = createHetznerCloudProvider({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await provider.deleteHost('1');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.DELETE_FAILED);
      }
    });
  });

  describe('status mapping', () => {
    const statusCases: Array<[HetznerServer['status'], string]> = [
      ['running', 'ready'],
      ['initializing', 'provisioning'],
      ['starting', 'provisioning'],
      ['rebuilding', 'provisioning'],
      ['stopping', 'deleting'],
      ['deleting', 'deleting'],
      ['off', 'error'],
      ['migrating', 'error'],
      ['unknown', 'error'],
    ];

    for (const [hetznerStatus, expectedStatus] of statusCases) {
      it(`maps Hetzner '${hetznerStatus}' → '${expectedStatus}'`, async () => {
        const server = makeServer({ status: hetznerStatus });
        const fetch = mockFetch([{ status: 200, body: { server } }]);
        const provider = createHetznerCloudProvider({ token: TOKEN, baseUrl: BASE_URL, fetch });

        const result = await provider.getHost('1');

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.status).toBe(expectedStatus);
        }
      });
    }
  });
});
