import type { CreateSessionRequest } from '@paws/types';

export interface WorkerHealth {
  status: string;
  worker: string;
  uptime: number;
  capacity: {
    maxConcurrent: number;
    running: number;
    queued: number;
    available: number;
  };
}

export interface WorkerSessionResult {
  sessionId: string;
  status: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  output?: unknown;
  durationMs?: number;
  completedAt?: string;
  worker?: string;
  exposedPorts?: Array<{ port: number; url: string; label?: string }>;
}

export interface WorkerClient {
  health(): Promise<WorkerHealth>;
  createSession(
    sessionId: string,
    request: CreateSessionRequest,
  ): Promise<{ sessionId: string; status: string }>;
  getSession(sessionId: string): Promise<WorkerSessionResult | undefined>;
  buildSnapshot(jobId: string, snapshotId: string, config: Record<string, unknown>): Promise<void>;
}

/** Create an HTTP client to communicate with a worker service */
export function createWorkerClient(baseUrl: string): WorkerClient {
  return {
    async health() {
      const res = await fetch(`${baseUrl}/health`);
      return (await res.json()) as WorkerHealth;
    },

    async createSession(sessionId, request) {
      const res = await fetch(`${baseUrl}/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, sessionId }),
      });
      return (await res.json()) as { sessionId: string; status: string };
    },

    async getSession(sessionId) {
      const res = await fetch(`${baseUrl}/v1/sessions/${sessionId}`);
      if (res.status === 404) return undefined;
      return (await res.json()) as WorkerSessionResult;
    },

    async buildSnapshot(jobId, snapshotId, config) {
      await fetch(`${baseUrl}/v1/snapshots/${snapshotId}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, ...config }),
      });
    },
  };
}
