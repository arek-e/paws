import { ResultAsync } from 'neverthrow';

import { ProviderError, ProviderErrorCode } from './provider-interface.js';
import type {
  HetznerCreateServerRequest,
  HetznerCreateServerResponse,
  HetznerServer,
  HetznerServerListResponse,
  HetznerServerResponse,
} from './types.js';

/** Injected fetch function for testability */
export type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface HetznerCloudClientOptions {
  token: string;
  baseUrl?: string;
  fetch?: FetchFn;
}

/**
 * Thin HTTP client for the Hetzner Cloud API.
 * Accepts an injected fetch for unit testability — never hits real API in tests.
 */
export function createHetznerCloudClient(options: HetznerCloudClientOptions) {
  const { token } = options;
  const baseUrl = options.baseUrl ?? 'https://api.hetzner.cloud/v1';
  const fetchFn: FetchFn = options.fetch ?? globalThis.fetch;

  async function apiRequest<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; data: T }> {
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const res = await fetchFn(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const text = await res.text();
    const data = text.length > 0 ? (JSON.parse(text) as T) : ({} as T);

    return { status: res.status, data };
  }

  function wrapError(code: ProviderErrorCode, label: string, e: unknown): ProviderError {
    if (e instanceof ProviderError) return e;
    return new ProviderError(code, `${label}: ${e}`, e);
  }

  return {
    /** List all servers */
    listServers(): ResultAsync<HetznerServer[], ProviderError> {
      return ResultAsync.fromPromise(
        apiRequest<HetznerServerListResponse>('GET', '/servers').then(({ status, data }) => {
          if (status >= 400) {
            throw new ProviderError(
              ProviderErrorCode.LIST_FAILED,
              `Hetzner Cloud GET /servers returned ${status}`,
            );
          }
          return data.servers;
        }),
        (e) => wrapError(ProviderErrorCode.LIST_FAILED, 'listServers failed', e),
      );
    },

    /** Get a single server by numeric ID */
    getServer(id: string): ResultAsync<HetznerServer, ProviderError> {
      return ResultAsync.fromPromise(
        apiRequest<HetznerServerResponse>('GET', `/servers/${id}`).then(({ status, data }) => {
          if (status === 404) {
            throw new ProviderError(
              ProviderErrorCode.NOT_FOUND,
              `Hetzner Cloud server ${id} not found`,
            );
          }
          if (status >= 400) {
            throw new ProviderError(
              ProviderErrorCode.API_ERROR,
              `Hetzner Cloud GET /servers/${id} returned ${status}`,
            );
          }
          return data.server;
        }),
        (e) => wrapError(ProviderErrorCode.API_ERROR, `getServer(${id}) failed`, e),
      );
    },

    /** Create a new server */
    createServer(request: HetznerCreateServerRequest): ResultAsync<HetznerServer, ProviderError> {
      return ResultAsync.fromPromise(
        apiRequest<HetznerCreateServerResponse>('POST', '/servers', request).then(
          ({ status, data }) => {
            if (status >= 400) {
              throw new ProviderError(
                ProviderErrorCode.CREATE_FAILED,
                `Hetzner Cloud POST /servers returned ${status}`,
              );
            }
            return data.server;
          },
        ),
        (e) => wrapError(ProviderErrorCode.CREATE_FAILED, 'createServer failed', e),
      );
    },

    /** Delete a server by numeric ID. Returns true if deleted, false if already gone (404). */
    deleteServer(id: string): ResultAsync<boolean, ProviderError> {
      return ResultAsync.fromPromise(
        apiRequest<unknown>('DELETE', `/servers/${id}`).then(({ status }) => {
          if (status === 404) return false;
          if (status >= 400) {
            throw new ProviderError(
              ProviderErrorCode.DELETE_FAILED,
              `Hetzner Cloud DELETE /servers/${id} returned ${status}`,
            );
          }
          return true;
        }),
        (e) => wrapError(ProviderErrorCode.DELETE_FAILED, `deleteServer(${id}) failed`, e),
      );
    },
  };
}

export type HetznerCloudClient = ReturnType<typeof createHetznerCloudClient>;
