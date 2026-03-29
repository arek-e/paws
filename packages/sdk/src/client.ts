import type {
  CancelSessionResponse,
  CostSummary,
  CreateDaemonInput,
  CreateDaemonResponse,
  CreateSessionInput,
  CreateSessionResponse,
  DaemonDetail,
  DaemonListResponse,
  FleetOverview,
  Session,
  SessionListResponse,
  SnapshotBuildRequest,
  SnapshotBuildResponse,
  SnapshotListResponse,
  UpdateDaemonRequest,
  WebhookTriggerResponse,
  WorkerListResponse,
} from '@paws/types';
import { ResultAsync } from 'neverthrow';

import { PawsApiError, PawsNetworkError } from './errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClientConfig {
  /** Gateway base URL (e.g. "http://localhost:4000") */
  baseUrl: string;
  /** API key for Authorization header */
  apiKey: string;
  /** Optional fetch implementation (for testing) */
  fetch?: typeof globalThis.fetch;
  /** Default timeout in ms for requests (default: 30_000) */
  timeoutMs?: number;
}

export type PawsError = PawsApiError | PawsNetworkError;

export interface PollOptions {
  /** Polling interval in ms (default: 1000) */
  intervalMs?: number;
  /** Maximum wait time in ms (default: 600_000 = 10 min) */
  timeoutMs?: number;
}

export interface PawsClient {
  readonly sessions: {
    list(options?: { limit?: number }): ResultAsync<SessionListResponse, PawsError>;
    create(request: CreateSessionInput): ResultAsync<CreateSessionResponse, PawsError>;
    get(id: string): ResultAsync<Session, PawsError>;
    cancel(id: string): ResultAsync<CancelSessionResponse, PawsError>;
    /** Poll until the session reaches a terminal state */
    waitForCompletion(id: string, options?: PollOptions): ResultAsync<Session, PawsError>;
  };
  readonly daemons: {
    create(request: CreateDaemonInput): ResultAsync<CreateDaemonResponse, PawsError>;
    list(): ResultAsync<DaemonListResponse, PawsError>;
    get(role: string): ResultAsync<DaemonDetail, PawsError>;
    update(role: string, request: UpdateDaemonRequest): ResultAsync<DaemonDetail, PawsError>;
    delete(role: string): ResultAsync<{ role: string; status: 'stopped' }, PawsError>;
  };
  readonly fleet: {
    overview(): ResultAsync<FleetOverview, PawsError>;
    workers(): ResultAsync<WorkerListResponse, PawsError>;
    cost(): ResultAsync<CostSummary, PawsError>;
  };
  readonly snapshots: {
    list(): ResultAsync<SnapshotListResponse, PawsError>;
    build(id: string, request: SnapshotBuildRequest): ResultAsync<SnapshotBuildResponse, PawsError>;
  };
  readonly webhooks: {
    trigger(role: string, payload: unknown): ResultAsync<WebhookTriggerResponse, PawsError>;
  };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'timeout', 'cancelled']);

export function createClient(config: ClientConfig): PawsClient {
  const { baseUrl, apiKey, timeoutMs: defaultTimeout = 30_000 } = config;
  const fetchFn = config.fetch ?? globalThis.fetch;

  // -- internal helpers --

  function request<T>(method: string, path: string, body?: unknown): ResultAsync<T, PawsError> {
    return ResultAsync.fromPromise(
      (async () => {
        const url = `${baseUrl}${path}`;
        const headers: Record<string, string> = {
          Authorization: `Bearer ${apiKey}`,
        };
        if (body !== undefined) {
          headers['Content-Type'] = 'application/json';
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), defaultTimeout);

        let res: Response;
        try {
          const init: RequestInit = { method, headers, signal: controller.signal };
          if (body !== undefined) {
            init.body = JSON.stringify(body);
          }
          res = await fetchFn(url, init);
        } finally {
          clearTimeout(timer);
        }

        const json = (await res.json()) as T;

        if (!res.ok) {
          throw new PawsApiError(
            res.status,
            json as unknown as import('@paws/types').ErrorResponse,
          );
        }

        return json;
      })(),
      (cause) => {
        if (cause instanceof PawsApiError) return cause;
        return new PawsNetworkError(
          cause instanceof Error ? cause.message : 'Request failed',
          cause,
        );
      },
    );
  }

  function waitForCompletion(id: string, options?: PollOptions): ResultAsync<Session, PawsError> {
    const intervalMs = options?.intervalMs ?? 1_000;
    const timeoutMs = options?.timeoutMs ?? 600_000;

    return ResultAsync.fromPromise(
      (async () => {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
          const result = await request<Session>('GET', `/v1/sessions/${id}`);
          if (result.isErr()) throw result.error;

          const session = result.value;
          if (TERMINAL_STATUSES.has(session.status)) {
            return session;
          }

          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }

        throw new PawsNetworkError(`Session ${id} did not complete within ${timeoutMs}ms`);
      })(),
      (cause) => {
        if (cause instanceof PawsApiError || cause instanceof PawsNetworkError) return cause;
        return new PawsNetworkError('Polling failed', cause);
      },
    );
  }

  // -- public API --

  return {
    sessions: {
      list: (options) => {
        const params = options?.limit ? `?limit=${options.limit}` : '';
        return request('GET', `/v1/sessions${params}`);
      },
      create: (req) => request('POST', '/v1/sessions', req),
      get: (id) => request('GET', `/v1/sessions/${id}`),
      cancel: (id) => request('DELETE', `/v1/sessions/${id}`),
      waitForCompletion,
    },
    daemons: {
      create: (req) => request('POST', '/v1/daemons', req),
      list: () => request('GET', '/v1/daemons'),
      get: (role) => request('GET', `/v1/daemons/${encodeURIComponent(role)}`),
      update: (role, req) => request('PATCH', `/v1/daemons/${encodeURIComponent(role)}`, req),
      delete: (role) => request('DELETE', `/v1/daemons/${encodeURIComponent(role)}`),
    },
    fleet: {
      overview: () => request('GET', '/v1/fleet'),
      workers: () => request('GET', '/v1/fleet/workers'),
      cost: () => request('GET', '/v1/fleet/cost'),
    },
    snapshots: {
      list: () => request('GET', '/v1/snapshots'),
      build: (id, req) => request('POST', `/v1/snapshots/${encodeURIComponent(id)}/build`, req),
    },
    webhooks: {
      trigger: (role, payload) =>
        request('POST', `/v1/webhooks/${encodeURIComponent(role)}`, payload),
    },
  };
}
