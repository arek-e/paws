import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';
import { CreateSessionRequestSchema, SnapshotBuildRequestSchema } from '@paws/types';

import { buildSnapshot, type SnapshotBuilderConfig } from './build/snapshot-builder.js';
import { createWorkerMetrics } from './metrics.js';
import type { Executor } from './session/executor.js';
import type { Semaphore } from './semaphore.js';
import type { SyncLoop } from './sync/sync-loop.js';

export interface AppDeps {
  executor: Executor;
  semaphore: Semaphore;
  workerName: string;
  syncLoop?: SyncLoop | undefined;
  /** Config for snapshot builder (optional — needed for build endpoint) */
  snapshotBuilderConfig?: SnapshotBuilderConfig | undefined;
}

const startTime = Date.now();

/** Create the Hono app with all worker routes */
export function createSessionApp(deps: AppDeps) {
  const app = new Hono();
  const { executor, semaphore, workerName, syncLoop } = deps;
  const metrics = createWorkerMetrics({ semaphore, executor, workerName });
  const sessionResults = new Map<
    string,
    {
      status: 'completed' | 'failed' | 'timeout';
      exitCode: number;
      stdout: string;
      stderr: string;
      output: unknown;
      durationMs: number;
      completedAt: string;
      exposedPorts?:
        | Array<{
            port: number;
            url: string;
            label?: string | undefined;
            access?: string | undefined;
            pin?: string | undefined;
            shareLink?: string | undefined;
          }>
        | undefined;
    }
  >();

  // Health endpoint
  app.get('/health', (c) => {
    const status =
      semaphore.running === 0 && semaphore.queued === 0
        ? 'healthy'
        : semaphore.available > 0
          ? 'healthy'
          : 'degraded';

    const syncStatus = syncLoop?.status();
    return c.json({
      status,
      worker: workerName,
      uptime: Date.now() - startTime,
      capacity: {
        maxConcurrent: semaphore.running + semaphore.available,
        running: semaphore.running,
        queued: semaphore.queued,
        available: semaphore.available,
      },
      pool: executor.poolStats,
      snapshot: {
        syncEnabled: !!syncLoop,
        currentVersion: syncStatus?.currentVersion ?? 0,
        syncing: syncStatus?.syncing ?? false,
        lastCheck: syncStatus?.lastCheck?.toISOString() ?? null,
        lastError: syncStatus?.lastError ?? null,
      },
    });
  });

  // Prometheus metrics
  app.get('/metrics', async (c) => {
    const output = await metrics.promRegistry.metrics();
    return c.text(output, 200, { 'Content-Type': 'text/plain; charset=utf-8' });
  });

  // Execute a session (fire-and-forget, returns 202)
  app.post('/v1/sessions', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } }, 400);
    }

    const parsed = CreateSessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues.map((i) => i.message).join(', '),
          },
        },
        400,
      );
    }

    const sessionId = randomUUID();

    // Fire-and-forget — execute in background, track results
    executor.execute(sessionId, parsed.data).then(
      (result) => {
        const status = result.exitCode === 0 ? 'completed' : 'failed';
        sessionResults.set(sessionId, {
          status,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          output: result.output,
          durationMs: result.durationMs,
          completedAt: new Date().toISOString(),
          exposedPorts: result.exposedPorts,
        });
      },
      (err) => {
        sessionResults.set(sessionId, {
          status: 'failed',
          exitCode: 1,
          stdout: '',
          stderr: err instanceof Error ? err.message : String(err),
          output: undefined,
          durationMs: Date.now() - Date.now(),
          completedAt: new Date().toISOString(),
        });
      },
    );

    return c.json({ sessionId, status: 'pending' }, 202);
  });

  // Get session status
  app.get('/v1/sessions/:id', (c) => {
    const id = c.req.param('id');

    // Check active sessions
    const active = executor.activeSessions.get(id);
    if (active) {
      return c.json({
        sessionId: id,
        status: 'running',
        startedAt: active.startedAt.toISOString(),
        worker: workerName,
        exposedPorts: active.exposedTunnels?.map((t) => ({
          port: t.port,
          url: t.publicUrl,
          label: t.label,
          access: t.access,
          pin: t.pin,
          shareLink: t.shareLink,
        })),
      });
    }

    // Check completed sessions
    const result = sessionResults.get(id);
    if (result) {
      return c.json({
        sessionId: id,
        ...result,
        worker: workerName,
      });
    }

    return c.json(
      { error: { code: 'SESSION_NOT_FOUND', message: `Session ${id} not found` } },
      404,
    );
  });

  // Build a snapshot (fire-and-forget, returns 202)
  app.post('/v1/snapshots/:id/build', async (c) => {
    if (!deps.snapshotBuilderConfig) {
      return c.json(
        {
          error: {
            code: 'NOT_CONFIGURED',
            message: 'Snapshot builder not configured on this worker',
          },
        },
        501,
      );
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } }, 400);
    }

    const parsed = SnapshotBuildRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues.map((i) => i.message).join(', '),
          },
        },
        400,
      );
    }

    const snapshotId = c.req.param('id');
    const jobId = (body as Record<string, unknown>)['jobId'] as string | undefined;

    // Fire-and-forget build
    void buildSnapshot(snapshotId, parsed.data, deps.snapshotBuilderConfig).then(
      (result) => {
        console.log(
          `snapshot build ${snapshotId}: ${result.status}${result.error ? ` — ${result.error}` : ''}`,
        );
      },
      (err) => {
        console.error(`snapshot build ${snapshotId} error:`, err);
      },
    );

    return c.json(
      { snapshotId, status: 'building', jobId: jobId ?? `build-${randomUUID().slice(0, 8)}` },
      202,
    );
  });

  return app;
}
