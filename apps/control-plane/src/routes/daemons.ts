import { createRoute, z } from '@hono/zod-openapi';
import { ErrorResponseSchema } from '@paws/domain-common';
import {
  CreateDaemonRequestSchema,
  CreateDaemonResponseSchema,
  DaemonDetailSchema,
  DaemonListResponseSchema,
  UpdateDaemonRequestSchema,
} from '@paws/domain-daemon';

export const createDaemonRoute = createRoute({
  method: 'post',
  path: '/v1/daemons',
  tags: ['Daemons'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateDaemonRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Daemon registered',
      content: { 'application/json': { schema: CreateDaemonResponseSchema } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Daemon already exists',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const listDaemonsRoute = createRoute({
  method: 'get',
  path: '/v1/daemons',
  tags: ['Daemons'],
  responses: {
    200: {
      description: 'List of daemons',
      content: { 'application/json': { schema: DaemonListResponseSchema } },
    },
  },
});

export const getDaemonRoute = createRoute({
  method: 'get',
  path: '/v1/daemons/{role}',
  tags: ['Daemons'],
  request: {
    params: z.object({ role: z.string().min(1) }),
  },
  responses: {
    200: {
      description: 'Daemon detail',
      content: { 'application/json': { schema: DaemonDetailSchema } },
    },
    404: {
      description: 'Daemon not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const updateDaemonRoute = createRoute({
  method: 'patch',
  path: '/v1/daemons/{role}',
  tags: ['Daemons'],
  request: {
    params: z.object({ role: z.string().min(1) }),
    body: {
      content: {
        'application/json': {
          schema: UpdateDaemonRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Daemon updated',
      content: { 'application/json': { schema: DaemonDetailSchema } },
    },
    404: {
      description: 'Daemon not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const deleteDaemonRoute = createRoute({
  method: 'delete',
  path: '/v1/daemons/{role}',
  tags: ['Daemons'],
  request: {
    params: z.object({ role: z.string().min(1) }),
  },
  responses: {
    200: {
      description: 'Daemon stopped',
      content: {
        'application/json': {
          schema: z.object({
            role: z.string(),
            status: z.literal('stopped'),
          }),
        },
      },
    },
    404: {
      description: 'Daemon not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
