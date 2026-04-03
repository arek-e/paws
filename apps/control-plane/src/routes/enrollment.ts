import { createRoute, z } from '@hono/zod-openapi';
import { OpenAPIHono } from '@hono/zod-openapi';
import { randomUUID } from 'node:crypto';
import { ErrorResponseSchema } from '@paws/domain-common';
import { createLogger } from '@paws/logger';

const log = createLogger('enrollment');

// ---------------------------------------------------------------------------
// Token store
// ---------------------------------------------------------------------------

interface EnrollmentToken {
  token: string;
  createdAt: number;
  expiresAt: number;
  createdBy: string;
  label?: string;
}

export interface EnrollmentStore {
  create(createdBy: string, ttlMs?: number, label?: string): EnrollmentToken;
  consume(token: string): EnrollmentToken | null;
  list(): EnrollmentToken[];
  prune(): number;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function createEnrollmentStore(): EnrollmentStore {
  const tokens = new Map<string, EnrollmentToken>();

  return {
    create(createdBy, ttlMs = DEFAULT_TTL_MS, label) {
      const token = `enroll-${randomUUID().replace(/-/g, '').slice(0, 24)}`;
      const now = Date.now();
      const entry: EnrollmentToken = {
        token,
        createdAt: now,
        expiresAt: now + ttlMs,
        createdBy,
        ...(label ? { label } : {}),
      };
      tokens.set(token, entry);
      log.info('Created enrollment token', {
        token: token.slice(0, 12) + '...',
        label,
        expiresIn: `${ttlMs / 1000}s`,
      });
      return entry;
    },

    consume(token) {
      const entry = tokens.get(token);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        tokens.delete(token);
        return null;
      }
      tokens.delete(token);
      log.info('Consumed enrollment token', { token: token.slice(0, 12) + '...' });
      return entry;
    },

    list() {
      const now = Date.now();
      return Array.from(tokens.values()).filter((t) => t.expiresAt > now);
    },

    prune() {
      const now = Date.now();
      let pruned = 0;
      for (const [key, entry] of tokens) {
        if (now > entry.expiresAt) {
          tokens.delete(key);
          pruned++;
        }
      }
      return pruned;
    },
  };
}

// ---------------------------------------------------------------------------
// Worker credential store
// ---------------------------------------------------------------------------

interface WorkerCredential {
  workerId: string;
  apiKey: string;
  name: string;
  createdAt: number;
  enrolledBy: string;
}

export interface WorkerCredentialStore {
  add(cred: WorkerCredential): void;
  getByApiKey(apiKey: string): WorkerCredential | undefined;
  list(): WorkerCredential[];
  revoke(workerId: string): boolean;
}

export function createWorkerCredentialStore(): WorkerCredentialStore {
  const credentials = new Map<string, WorkerCredential>();
  const byApiKey = new Map<string, WorkerCredential>();

  return {
    add(cred) {
      credentials.set(cred.workerId, cred);
      byApiKey.set(cred.apiKey, cred);
    },

    getByApiKey(apiKey) {
      return byApiKey.get(apiKey);
    },

    list() {
      return Array.from(credentials.values());
    },

    revoke(workerId) {
      const cred = credentials.get(workerId);
      if (!cred) return false;
      credentials.delete(workerId);
      byApiKey.delete(cred.apiKey);
      log.info('Revoked worker credential', { workerId, name: cred.name });
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const createEnrollmentTokenRoute = createRoute({
  method: 'post',
  path: '/v1/workers/enrollment-tokens',
  tags: ['Workers'],
  description: 'Generate a one-time enrollment token for adding a new worker server',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            label: z.string().optional(),
            ttlSeconds: z.number().int().min(60).max(3600).default(900),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Enrollment token created',
      content: {
        'application/json': {
          schema: z.object({
            token: z.string(),
            expiresAt: z.string(),
            installCommand: z.string(),
          }),
        },
      },
    },
  },
});

const enrollWorkerRoute = createRoute({
  method: 'post',
  path: '/v1/workers/enroll',
  tags: ['Workers'],
  description:
    'Enroll a new worker using a one-time enrollment token. Returns a permanent API key.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            token: z.string().min(1),
            name: z.string().min(1),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Worker enrolled successfully',
      content: {
        'application/json': {
          schema: z.object({
            workerId: z.string(),
            apiKey: z.string(),
            name: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Invalid or expired enrollment token',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const listWorkersRoute = createRoute({
  method: 'get',
  path: '/v1/workers/credentials',
  tags: ['Workers'],
  responses: {
    200: {
      description: 'List of enrolled workers',
      content: {
        'application/json': {
          schema: z.object({
            workers: z.array(
              z.object({
                workerId: z.string(),
                name: z.string(),
                createdAt: z.string(),
              }),
            ),
          }),
        },
      },
    },
  },
});

const revokeWorkerRoute = createRoute({
  method: 'delete',
  path: '/v1/workers/credentials/{workerId}',
  tags: ['Workers'],
  request: {
    params: z.object({ workerId: z.string() }),
  },
  responses: {
    200: {
      description: 'Worker credential revoked',
      content: {
        'application/json': {
          schema: z.object({ workerId: z.string(), status: z.literal('revoked') }),
        },
      },
    },
    404: {
      description: 'Worker not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface EnrollmentRouteDeps {
  enrollmentStore: EnrollmentStore;
  workerCredentialStore: WorkerCredentialStore;
  gatewayUrl: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEnrollmentRoutes(deps: EnrollmentRouteDeps) {
  const { enrollmentStore, workerCredentialStore, gatewayUrl } = deps;
  const app = new OpenAPIHono();

  // Prune expired tokens every 5 minutes
  setInterval(() => enrollmentStore.prune(), 5 * 60 * 1000);

  // --- POST /v1/workers/enrollment-tokens ---
  app.openapi(createEnrollmentTokenRoute, (c) => {
    const { ttlSeconds, label } = c.req.valid('json');
    const entry = enrollmentStore.create('api', ttlSeconds * 1000, label);

    const installCommand = [
      'curl -fsSL https://raw.githubusercontent.com/arek-e/paws/main/scripts/setup-worker.sh | bash -s --',
      `--gateway-url ${gatewayUrl}`,
      `--enrollment-token ${entry.token}`,
    ].join(' \\\n  ');

    return c.json(
      {
        token: entry.token,
        expiresAt: new Date(entry.expiresAt).toISOString(),
        installCommand,
      },
      201,
    );
  });

  // --- POST /v1/workers/enroll ---
  // No auth required — the enrollment token IS the auth
  app.openapi(enrollWorkerRoute, (c) => {
    const { token, name } = c.req.valid('json');

    const entry = enrollmentStore.consume(token);
    if (!entry) {
      return c.json(
        {
          error: {
            code: 'UNAUTHORIZED' as const,
            message: 'Invalid or expired enrollment token',
          },
        },
        401,
      );
    }

    // Generate permanent worker credentials
    const workerId = randomUUID();
    const apiKey = `paws-worker-${randomUUID().replace(/-/g, '').slice(0, 32)}`;

    workerCredentialStore.add({
      workerId,
      apiKey,
      name,
      createdAt: Date.now(),
      enrolledBy: entry.createdBy,
    });

    log.info('Worker enrolled', { workerId, name, enrolledBy: entry.createdBy });

    return c.json({ workerId, apiKey, name }, 201);
  });

  // --- GET /v1/workers/credentials ---
  app.openapi(listWorkersRoute, (c) => {
    const workers = workerCredentialStore.list().map((w) => ({
      workerId: w.workerId,
      name: w.name,
      createdAt: new Date(w.createdAt).toISOString(),
    }));
    return c.json({ workers }, 200);
  });

  // --- DELETE /v1/workers/credentials/:workerId ---
  app.openapi(revokeWorkerRoute, (c) => {
    const { workerId } = c.req.valid('param');
    if (!workerCredentialStore.revoke(workerId)) {
      return c.json(
        { error: { code: 'NOT_FOUND' as const, message: `Worker ${workerId} not found` } },
        404,
      );
    }
    return c.json({ workerId, status: 'revoked' as const }, 200);
  });

  return app;
}
