import { describe, expect, it } from 'vitest';

import { ProvidersErrorCode } from '@paws/providers';

import { ROBOT_BASE_URL, createHetznerRobotClient } from './client.js';
import type { FetchFn } from './client.js';
import type {
  HetznerOrderTransactionWrapper,
  HetznerServerListResponse,
  HetznerServerWrapper,
} from './types.js';

const TEST_USERNAME = 'test-user';
const TEST_PASSWORD = 'test-password';

function makeServerWrapper(
  overrides: Partial<HetznerServerWrapper['server']> = {},
): HetznerServerWrapper {
  return {
    server: {
      server_number: 12345,
      server_name: 'my-server',
      server_ip: '1.2.3.4',
      server_ipv6_net: '2a01::/64',
      dc: 'FSN1-DC14',
      product: 'AX41-NVMe',
      status: 'ready',
      cancelled: false,
      paid_until: '2025-01-01',
      ...overrides,
    },
  };
}

function makeFetch(status: number, body: unknown): FetchFn {
  return async (_url, _init) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
}

function captureRequest(): {
  calls: Array<{ url: string; init: RequestInit | undefined }>;
  fetch: FetchFn;
} {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  return {
    calls,
    fetch: async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 200 });
    },
  };
}

describe('createHetznerRobotClient', () => {
  describe('listServers', () => {
    it('returns a mapped server list on success', async () => {
      const serverList: HetznerServerListResponse = [makeServerWrapper()];
      const client = createHetznerRobotClient({
        username: TEST_USERNAME,
        password: TEST_PASSWORD,
        fetch: makeFetch(200, serverList),
      });

      const result = await client.listServers();
      expect(result.isOk()).toBe(true);
      const servers = result._unsafeUnwrap();
      expect(servers).toHaveLength(1);
      expect(servers[0]?.server.server_number).toBe(12345);
    });

    it('sets Authorization header with Basic auth', async () => {
      const { calls, fetch } = captureRequest();
      const client = createHetznerRobotClient({ username: 'u', password: 'p', fetch });
      await client.listServers();

      expect(calls).toHaveLength(1);
      const reqInit = calls[0]?.init as RequestInit & { headers: Record<string, string> };
      const expected = `Basic ${btoa('u:p')}`;
      expect(reqInit.headers['Authorization']).toBe(expected);
    });

    it('calls the correct URL', async () => {
      const { calls, fetch } = captureRequest();
      const client = createHetznerRobotClient({ username: 'u', password: 'p', fetch });
      await client.listServers();

      expect(calls[0]?.url).toBe(`${ROBOT_BASE_URL}/server`);
    });

    it('respects a custom baseUrl', async () => {
      const { calls, fetch } = captureRequest();
      const client = createHetznerRobotClient({
        username: 'u',
        password: 'p',
        baseUrl: 'http://localhost:9999',
        fetch,
      });
      await client.listServers();

      expect(calls[0]?.url).toBe('http://localhost:9999/server');
    });

    it('returns API_ERROR on 500', async () => {
      const client = createHetznerRobotClient({
        username: TEST_USERNAME,
        password: TEST_PASSWORD,
        fetch: makeFetch(500, { error: { status: 500, code: 'SERVER_ERROR', message: 'oops' } }),
      });

      const result = await client.listServers();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(ProvidersErrorCode.API_ERROR);
    });
  });

  describe('getServer', () => {
    it('returns a server wrapper on success', async () => {
      const wrapper = makeServerWrapper({ server_number: 99 });
      const client = createHetznerRobotClient({
        username: TEST_USERNAME,
        password: TEST_PASSWORD,
        fetch: makeFetch(200, wrapper),
      });

      const result = await client.getServer(99);
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().server.server_number).toBe(99);
    });

    it('calls the correct URL with server number', async () => {
      const { calls, fetch } = captureRequest();
      const client = createHetznerRobotClient({ username: 'u', password: 'p', fetch });
      await client.getServer(42);

      expect(calls[0]?.url).toBe(`${ROBOT_BASE_URL}/server/42`);
    });

    it('returns HOST_NOT_FOUND on 404', async () => {
      const client = createHetznerRobotClient({
        username: TEST_USERNAME,
        password: TEST_PASSWORD,
        fetch: makeFetch(404, { error: { status: 404, code: 'NOT_FOUND', message: 'not found' } }),
      });

      const result = await client.getServer(999);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(ProvidersErrorCode.HOST_NOT_FOUND);
    });
  });

  describe('orderServer', () => {
    it('sends POST to /order/server/transaction', async () => {
      const { calls, fetch } = captureRequest();
      const client = createHetznerRobotClient({ username: 'u', password: 'p', fetch });
      await client.orderServer({ product_id: 'AX41-NVMe', location: 'FSN1', hostname: 'my-host' });

      expect(calls[0]?.url).toBe(`${ROBOT_BASE_URL}/order/server/transaction`);
      expect(calls[0]?.init?.method).toBe('POST');
    });

    it('sends form-encoded body', async () => {
      const { calls, fetch } = captureRequest();
      const client = createHetznerRobotClient({ username: 'u', password: 'p', fetch });
      await client.orderServer({ product_id: 'AX41-NVMe', location: 'FSN1', hostname: 'my-host' });

      const reqInit = calls[0]?.init as RequestInit & {
        headers: Record<string, string>;
        body: string;
      };
      expect(reqInit.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      const params = new URLSearchParams(reqInit.body);
      expect(params.get('product_id')).toBe('AX41-NVMe');
      expect(params.get('location')).toBe('FSN1');
      expect(params.get('hostname')).toBe('my-host');
    });

    it('returns transaction wrapper on success', async () => {
      const txResponse: HetznerOrderTransactionWrapper = {
        transaction: {
          id: 'tx-abc123',
          date: '2025-01-01T00:00:00Z',
          status: 'in progress',
          server_number: null,
        },
      };
      const client = createHetznerRobotClient({
        username: TEST_USERNAME,
        password: TEST_PASSWORD,
        fetch: makeFetch(201, txResponse),
      });

      const result = await client.orderServer({ product_id: 'AX41-NVMe' });
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().transaction.id).toBe('tx-abc123');
    });

    it('returns API_ERROR on failure', async () => {
      const client = createHetznerRobotClient({
        username: TEST_USERNAME,
        password: TEST_PASSWORD,
        fetch: makeFetch(422, {
          error: { status: 422, code: 'INVALID_INPUT', message: 'bad plan' },
        }),
      });

      const result = await client.orderServer({ product_id: 'INVALID' });
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(ProvidersErrorCode.API_ERROR);
    });
  });

  describe('deleteServer', () => {
    it('sends DELETE to /server/{serverNumber}', async () => {
      const { calls, fetch } = captureRequest();
      const client = createHetznerRobotClient({ username: 'u', password: 'p', fetch });
      await client.deleteServer(12345);

      expect(calls[0]?.url).toBe(`${ROBOT_BASE_URL}/server/12345`);
      expect(calls[0]?.init?.method).toBe('DELETE');
    });

    it('returns Ok(void) on success', async () => {
      const client = createHetznerRobotClient({
        username: TEST_USERNAME,
        password: TEST_PASSWORD,
        fetch: makeFetch(200, {}),
      });

      const result = await client.deleteServer(12345);
      expect(result.isOk()).toBe(true);
    });

    it('returns HOST_NOT_FOUND on 404', async () => {
      const client = createHetznerRobotClient({
        username: TEST_USERNAME,
        password: TEST_PASSWORD,
        fetch: makeFetch(404, {}),
      });

      const result = await client.deleteServer(999);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(ProvidersErrorCode.HOST_NOT_FOUND);
    });
  });

  describe('network errors', () => {
    it('wraps fetch rejection in ProvidersError with API_ERROR', async () => {
      const client = createHetznerRobotClient({
        username: TEST_USERNAME,
        password: TEST_PASSWORD,
        fetch: async () => {
          throw new Error('network unreachable');
        },
      });

      const result = await client.listServers();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(ProvidersErrorCode.API_ERROR);
    });
  });
});
