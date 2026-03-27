import { ResultAsync } from 'neverthrow';

import { ProvidersError, ProvidersErrorCode } from '@paws/providers';

import type {
  HetznerOrderServerRequest,
  HetznerOrderTransactionWrapper,
  HetznerServerListResponse,
  HetznerServerWrapper,
} from './types.js';

export const ROBOT_BASE_URL = 'https://robot-ws.your-server.de';

/** Injectable fetch function for testability */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface HetznerDedicatedClientOptions {
  username: string;
  password: string;
  baseUrl?: string;
  fetch?: FetchFn;
}

function buildBasicAuth(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

/** Create a thin HTTP client for the Hetzner Robot API */
export function createHetznerRobotClient(options: HetznerDedicatedClientOptions) {
  const { username, password } = options;
  const baseUrl = options.baseUrl ?? ROBOT_BASE_URL;
  const fetchFn: FetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  const authHeader = buildBasicAuth(username, password);

  function apiCall<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): ResultAsync<T, ProvidersError> {
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: authHeader,
      Accept: 'application/json',
    };

    let bodyStr: string | undefined;
    if (body !== undefined) {
      // Hetzner Robot API uses application/x-www-form-urlencoded for POST
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      bodyStr = new URLSearchParams(
        Object.fromEntries(
          Object.entries(body)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => [k, String(v)]),
        ),
      ).toString();
    }

    const fetchInit: RequestInit = { method, headers };
    if (bodyStr !== undefined) {
      fetchInit.body = bodyStr;
    }

    return ResultAsync.fromPromise(
      fetchFn(url, fetchInit).then(async (res) => {
        const text = await res.text();

        if (res.status === 404) {
          throw new ProvidersError(
            ProvidersErrorCode.HOST_NOT_FOUND,
            `Hetzner Robot API ${method} ${path} returned 404: ${text}`,
          );
        }

        if (res.status >= 400) {
          throw new ProvidersError(
            ProvidersErrorCode.API_ERROR,
            `Hetzner Robot API ${method} ${path} returned ${res.status}: ${text}`,
          );
        }

        return JSON.parse(text) as T;
      }),
      (e) => {
        if (e instanceof ProvidersError) return e;
        return new ProvidersError(
          ProvidersErrorCode.API_ERROR,
          `Hetzner Robot API ${method} ${path} failed: ${e}`,
          e,
        );
      },
    );
  }

  return {
    /** GET /server — list all servers */
    listServers(): ResultAsync<HetznerServerListResponse, ProvidersError> {
      return apiCall<HetznerServerListResponse>('GET', '/server');
    },

    /** GET /server/{serverNumber} — get a single server */
    getServer(serverNumber: number): ResultAsync<HetznerServerWrapper, ProvidersError> {
      return apiCall<HetznerServerWrapper>('GET', `/server/${serverNumber}`);
    },

    /** POST /order/server/transaction — order a new dedicated server */
    orderServer(
      request: HetznerOrderServerRequest,
    ): ResultAsync<HetznerOrderTransactionWrapper, ProvidersError> {
      const body: Record<string, unknown> = { product_id: request.product_id };
      if (request.location !== undefined) body['location'] = request.location;
      if (request.hostname !== undefined) body['hostname'] = request.hostname;
      if (request.authorized_key !== undefined) {
        body['authorized_key[]'] = request.authorized_key.join(',');
      }
      return apiCall<HetznerOrderTransactionWrapper>('POST', '/order/server/transaction', body);
    },

    /** DELETE /server/{serverNumber} — cancel/delete a server */
    deleteServer(serverNumber: number): ResultAsync<void, ProvidersError> {
      return apiCall<unknown>('DELETE', `/server/${serverNumber}`).map(() => undefined);
    },
  };
}

export type HetznerRobotClient = ReturnType<typeof createHetznerRobotClient>;
