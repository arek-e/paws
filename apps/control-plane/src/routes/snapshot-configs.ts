import { createRoute, z } from '@hono/zod-openapi';
import {
  ErrorResponseSchema,
  SnapshotConfigListResponseSchema,
  SnapshotConfigSchema,
} from '@paws/types';

export const createSnapshotConfigRoute = createRoute({
  method: 'post',
  path: '/v1/snapshot-configs',
  tags: ['Snapshot Configs'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: SnapshotConfigSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Snapshot config created',
      content: { 'application/json': { schema: SnapshotConfigSchema } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Config already exists',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const listSnapshotConfigsRoute = createRoute({
  method: 'get',
  path: '/v1/snapshot-configs',
  tags: ['Snapshot Configs'],
  responses: {
    200: {
      description: 'List of snapshot configs',
      content: { 'application/json': { schema: SnapshotConfigListResponseSchema } },
    },
  },
});

export const getSnapshotConfigRoute = createRoute({
  method: 'get',
  path: '/v1/snapshot-configs/{id}',
  tags: ['Snapshot Configs'],
  request: {
    params: z.object({ id: z.string().min(1) }),
  },
  responses: {
    200: {
      description: 'Snapshot config',
      content: { 'application/json': { schema: SnapshotConfigSchema } },
    },
    404: {
      description: 'Config not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const updateSnapshotConfigRoute = createRoute({
  method: 'put',
  path: '/v1/snapshot-configs/{id}',
  tags: ['Snapshot Configs'],
  request: {
    params: z.object({ id: z.string().min(1) }),
    body: {
      content: {
        'application/json': {
          schema: SnapshotConfigSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Snapshot config updated',
      content: { 'application/json': { schema: SnapshotConfigSchema } },
    },
    404: {
      description: 'Config not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const deleteSnapshotConfigRoute = createRoute({
  method: 'delete',
  path: '/v1/snapshot-configs/{id}',
  tags: ['Snapshot Configs'],
  request: {
    params: z.object({ id: z.string().min(1) }),
  },
  responses: {
    204: {
      description: 'Config deleted',
    },
    404: {
      description: 'Config not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
