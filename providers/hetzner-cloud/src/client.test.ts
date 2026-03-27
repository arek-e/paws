import { describe, expect, it } from 'vitest';

import type { FetchFn } from './client.js';
import { createHetznerCloudClient } from './client.js';
import { ProviderErrorCode } from './provider-interface.js';
import type { HetznerServer } from './types.js';

const BASE_URL = 'https://api.hetzner.cloud/v1';
const TOKEN = 'test-token-abc';

/** Helper: build a minimal HetznerServer fixture */
function makeServer(overrides: Partial<HetznerServer> = {}): HetznerServer {
  return {
    id: 1,
    name: 'test-server',
    status: 'running',
    created: '2024-01-01T00:00:00Z',
    public_net: {
      ipv4: { ip: '1.2.3.4' },
      ipv6: { ip: '2001:db8::1' },
    },
    datacenter: { name: 'fsn1-dc14' },
    server_type: { name: 'cx31' },
    ...overrides,
  };
}

/** Helper: build a mock fetch that returns a canned response */
function mockFetch(
  status: number,
  body: unknown,
  spy: { lastUrl?: string; lastMethod?: string; lastBody?: unknown } = {},
): FetchFn {
  return async (input, init) => {
    spy.lastUrl = typeof input === 'string' ? input : input.toString();
    spy.lastMethod = init?.method ?? 'GET';
    if (init?.body) {
      spy.lastBody = JSON.parse(init.body as string);
    }
    if (body === null || status === 204) {
      return new Response(null, { status });
    }
    return new Response(JSON.stringify(body), { status });
  };
}

describe('createHetznerCloudClient', () => {
  describe('listServers', () => {
    it('returns mapped server list on success', async () => {
      const server = makeServer();
      const fetch = mockFetch(200, { servers: [server] });
      const client = createHetznerCloudClient({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await client.listServers();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.id).toBe(1);
        expect(result.value[0]?.name).toBe('test-server');
      }
    });

    it('returns LIST_FAILED error on non-2xx response', async () => {
      const fetch = mockFetch(401, { error: { code: 'unauthorized', message: 'Unauthorized' } });
      const client = createHetznerCloudClient({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await client.listServers();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.LIST_FAILED);
      }
    });

    it('sends Authorization header with Bearer token', async () => {
      const spy: { lastUrl?: string } = {};
      const fetchSpy: FetchFn = async (input, init) => {
        spy.lastUrl = typeof input === 'string' ? input : input.toString();
        const headers = init?.headers as Record<string, string> | undefined;
        expect(headers?.['Authorization']).toBe(`Bearer ${TOKEN}`);
        return new Response(JSON.stringify({ servers: [] }), { status: 200 });
      };
      const client = createHetznerCloudClient({ token: TOKEN, baseUrl: BASE_URL, fetch: fetchSpy });

      await client.listServers();

      expect(spy.lastUrl).toBe(`${BASE_URL}/servers`);
    });
  });

  describe('getServer', () => {
    it('returns server on success', async () => {
      const server = makeServer({ id: 42, name: 'my-server' });
      const fetch = mockFetch(200, { server });
      const client = createHetznerCloudClient({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await client.getServer('42');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe(42);
        expect(result.value.name).toBe('my-server');
      }
    });

    it('returns NOT_FOUND error on 404', async () => {
      const fetch = mockFetch(404, { error: { code: 'not_found', message: 'Not found' } });
      const client = createHetznerCloudClient({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await client.getServer('999');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.NOT_FOUND);
      }
    });

    it('returns API_ERROR on other non-2xx responses', async () => {
      const fetch = mockFetch(500, { error: { code: 'internal_error', message: 'Server error' } });
      const client = createHetznerCloudClient({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await client.getServer('1');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.API_ERROR);
      }
    });

    it('hits the correct URL', async () => {
      const spy: { lastUrl?: string } = {};
      const fetch = mockFetch(200, { server: makeServer({ id: 7 }) }, spy);
      const client = createHetznerCloudClient({ token: TOKEN, baseUrl: BASE_URL, fetch });

      await client.getServer('7');

      expect(spy.lastUrl).toBe(`${BASE_URL}/servers/7`);
    });
  });

  describe('createServer', () => {
    it('returns created server on success', async () => {
      const server = makeServer({ id: 100, name: 'new-node', status: 'initializing' });
      const spy: { lastMethod?: string; lastBody?: unknown } = {};
      const fetch = mockFetch(201, { server }, spy);
      const client = createHetznerCloudClient({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await client.createServer({
        name: 'new-node',
        server_type: 'cx31',
        image: 'ubuntu-24.04',
        location: 'fsn1',
        ssh_keys: ['my-key'],
        user_data: '#!/bin/bash\necho hi',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe(100);
        expect(result.value.name).toBe('new-node');
      }

      expect(spy.lastMethod).toBe('POST');
      expect(spy.lastBody).toMatchObject({
        name: 'new-node',
        server_type: 'cx31',
        image: 'ubuntu-24.04',
        location: 'fsn1',
        ssh_keys: ['my-key'],
        user_data: '#!/bin/bash\necho hi',
      });
    });

    it('returns CREATE_FAILED error on non-2xx response', async () => {
      const fetch = mockFetch(422, { error: { code: 'invalid_input', message: 'Bad request' } });
      const client = createHetznerCloudClient({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await client.createServer({
        name: 'bad',
        server_type: 'cx31',
        image: 'ubuntu-24.04',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.CREATE_FAILED);
      }
    });

    it('sends POST to /servers', async () => {
      const spy: { lastUrl?: string; lastMethod?: string } = {};
      const fetch = mockFetch(201, { server: makeServer() }, spy);
      const client = createHetznerCloudClient({ token: TOKEN, baseUrl: BASE_URL, fetch });

      await client.createServer({ name: 'n', server_type: 'cx21', image: 'ubuntu-24.04' });

      expect(spy.lastUrl).toBe(`${BASE_URL}/servers`);
      expect(spy.lastMethod).toBe('POST');
    });
  });

  describe('deleteServer', () => {
    it('returns true on successful deletion (204)', async () => {
      const fetch = mockFetch(204, null);
      const client = createHetznerCloudClient({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await client.deleteServer('1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });

    it('returns false on 404 (already gone)', async () => {
      const fetch = mockFetch(404, { error: { code: 'not_found', message: 'Not found' } });
      const client = createHetznerCloudClient({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await client.deleteServer('999');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(false);
      }
    });

    it('returns DELETE_FAILED on other non-2xx responses', async () => {
      const fetch = mockFetch(500, { error: { code: 'internal_error', message: 'Error' } });
      const client = createHetznerCloudClient({ token: TOKEN, baseUrl: BASE_URL, fetch });

      const result = await client.deleteServer('1');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.DELETE_FAILED);
      }
    });

    it('sends DELETE to correct URL', async () => {
      const spy: { lastUrl?: string; lastMethod?: string } = {};
      const fetch = mockFetch(204, null, spy);
      const client = createHetznerCloudClient({ token: TOKEN, baseUrl: BASE_URL, fetch });

      await client.deleteServer('5');

      expect(spy.lastUrl).toBe(`${BASE_URL}/servers/5`);
      expect(spy.lastMethod).toBe('DELETE');
    });
  });
});
