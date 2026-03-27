import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';
import { CreateSessionRequestSchema } from '@paws/types';

import type { Executor } from './session/executor.js';
import type { Semaphore } from './semaphore.js';
import type { SyncLoop } from './sync/sync-loop.js';

export interface AppDeps {
  executor: Executor;
  semaphore: Semaphore;
  workerName: string;
  syncLoop?: SyncLoop | undefined;
}

const startTime = Date.now();

/** Create the Hono app with all worker routes */
export function createSessionApp(deps: AppDeps) {
  const app = new Hono();
  const { executor, semaphore, workerName, syncLoop } = deps;
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

  return app;
}
