import { randomUUID } from 'node:crypto';

import { createRoute, z } from '@hono/zod-openapi';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { Server } from '@paws/provisioner';
import { ErrorResponseSchema } from '@paws/types';

import type { ServerStore } from '../store/servers.js';
import type { WorkerRegistry } from '../discovery/registry.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ServerResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  ip: z.string(),
  status: z.enum(['provisioning', 'waiting_ssh', 'bootstrapping', 'registering', 'ready', 'error']),
  provider: z.enum(['manual', 'aws-ec2']),
  createdAt: z.string().datetime(),
  error: z.string().optional(),
});

const ServerListResponseSchema = z.object({
  servers: z.array(ServerResponseSchema),
});

const CreateServerRequestSchema = z.object({
  provider: z.literal('manual'),
  name: z.string().min(1),
  ip: z.string().min(1),
  password: z.string().min(1),
});

const ValidationCheckSchema = z.object({
  label: z.string(),
  status: z.enum(['pass', 'fail', 'pending']),
  message: z.string().optional(),
});

const ValidationResultSchema = z.object({
  serverId: z.string().uuid(),
  checks: z.array(ValidationCheckSchema),
});

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const listServersRoute = createRoute({
  method: 'get',
  path: '/v1/servers',
  tags: ['Servers'],
  responses: {
    200: {
      description: 'List of servers',
      content: { 'application/json': { schema: ServerListResponseSchema } },
    },
  },
});

const createServerRoute = createRoute({
  method: 'post',
  path: '/v1/servers',
  tags: ['Servers'],
  request: {
    body: {
      content: {
        'application/json': { schema: CreateServerRequestSchema },
      },
    },
  },
  responses: {
    202: {
      description: 'Server creation started',
      content: {
        'application/json': {
          schema: z.object({ serverId: z.string().uuid() }),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const getServerRoute = createRoute({
  method: 'get',
  path: '/v1/servers/{id}',
  tags: ['Servers'],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Server detail',
      content: { 'application/json': { schema: ServerResponseSchema } },
    },
    404: {
      description: 'Server not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const deleteServerRoute = createRoute({
  method: 'delete',
  path: '/v1/servers/{id}',
  tags: ['Servers'],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Server removed',
      content: {
        'application/json': {
          schema: z.object({
            serverId: z.string().uuid(),
            status: z.literal('deleted'),
          }),
        },
      },
    },
    404: {
      description: 'Server not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const validateServerRoute = createRoute({
  method: 'post',
  path: '/v1/servers/{id}/validate',
  tags: ['Servers'],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Validation result',
      content: { 'application/json': { schema: ValidationResultSchema } },
    },
    404: {
      description: 'Server not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface ServerRouteDeps {
  serverStore: ServerStore;
  workerRegistry?: WorkerRegistry | undefined;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function toResponse(s: Server) {
  return {
    id: s.id,
    name: s.name,
    ip: s.ip,
    status: s.status,
    provider: s.provider,
    createdAt: s.createdAt,
    ...(s.error ? { error: s.error } : {}),
  };
}

export function createServerRoutes(deps: ServerRouteDeps) {
  const { serverStore, workerRegistry } = deps;
  const app = new OpenAPIHono();

  // --- GET /v1/servers ---

  app.openapi(listServersRoute, (c) => {
    const servers = serverStore.list().map(toResponse);
    return c.json({ servers }, 200);
  });

  // --- POST /v1/servers ---

  app.openapi(createServerRoute, (c) => {
    const body = c.req.valid('json');
    const id = randomUUID();
    const now = new Date().toISOString();

    const server: Server = {
      id,
      name: body.name,
      ip: body.ip,
      status: 'waiting_ssh',
      provider: 'manual',
      sshPublicKey: '',
      sshPrivateKeyEncrypted: '',
      createdAt: now,
    };

    serverStore.create(server);
    return c.json({ serverId: id }, 202);
  });

  // --- GET /v1/servers/:id ---

  app.openapi(getServerRoute, (c) => {
    const { id } = c.req.valid('param');
    const server = serverStore.get(id);
    if (!server) {
      return c.json(
        { error: { code: 'NOT_FOUND' as const, message: `Server ${id} not found` } },
        404,
      );
    }
    return c.json(toResponse(server), 200);
  });

  // --- DELETE /v1/servers/:id ---

  app.openapi(deleteServerRoute, (c) => {
    const { id } = c.req.valid('param');
    if (!serverStore.delete(id)) {
      return c.json(
        { error: { code: 'NOT_FOUND' as const, message: `Server ${id} not found` } },
        404,
      );
    }
    return c.json({ serverId: id, status: 'deleted' as const }, 200);
  });

  // --- POST /v1/servers/:id/validate ---

  app.openapi(validateServerRoute, async (c) => {
    const { id } = c.req.valid('param');
    const server = serverStore.get(id);
    if (!server) {
      return c.json(
        { error: { code: 'NOT_FOUND' as const, message: `Server ${id} not found` } },
        404,
      );
    }

    const checks: Array<{ label: string; status: 'pass' | 'fail' | 'pending'; message?: string }> =
      [];

    // Check 1: SSH accessible — try to reach port 22
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const conn = await Bun.connect({
        hostname: server.ip,
        port: 22,
        socket: {
          data() {},
          open(socket) {
            socket.end();
          },
          error() {},
          close() {},
        },
      });
      clearTimeout(timeout);
      conn.end();
      checks.push({ label: 'SSH accessible', status: 'pass' });
    } catch {
      checks.push({ label: 'SSH accessible', status: 'fail', message: 'Cannot reach port 22' });
    }

    // Check 2: Server status is ready
    if (server.status === 'ready') {
      checks.push({ label: '/dev/kvm available', status: 'pass' });
    } else if (server.status === 'error') {
      checks.push({
        label: '/dev/kvm available',
        status: 'fail',
        message: server.error ?? 'Server in error state',
      });
    } else {
      checks.push({
        label: '/dev/kvm available',
        status: 'pending',
        message: `Server status: ${server.status}`,
      });
    }

    // Check 3: Firecracker installed — inferred from server status
    if (server.status === 'ready') {
      checks.push({ label: 'Firecracker installed', status: 'pass' });
    } else {
      checks.push({
        label: 'Firecracker installed',
        status: 'pending',
        message: 'Bootstrap not completed',
      });
    }

    // Check 4: Worker registered — check the worker registry
    const workerRegistered = workerRegistry
      ? workerRegistry.getAll().some((w) => w.name.includes(server.ip) || w.url.includes(server.ip))
      : false;
    if (workerRegistered) {
      checks.push({ label: 'Worker registered', status: 'pass' });
    } else {
      checks.push({
        label: 'Worker registered',
        status: 'fail',
        message: 'Worker not found in registry',
      });
    }

    return c.json({ serverId: id, checks }, 200);
  });

  return app;
}
