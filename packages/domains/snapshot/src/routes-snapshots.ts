import { createRoute, z } from '@hono/zod-openapi';
import { ErrorResponseSchema } from '@paws/domain-common';
import {
  SnapshotBuildRequestSchema,
  SnapshotBuildResponseSchema,
  SnapshotListResponseSchema,
} from './types.js';

export const buildSnapshotRoute = createRoute({
  method: 'post',
  path: '/v1/snapshots/{id}/build',
  tags: ['Snapshots'],
  request: {
    params: z.object({ id: z.string().min(1) }),
    body: {
      content: {
        'application/json': {
          schema: SnapshotBuildRequestSchema,
        },
      },
    },
  },
  responses: {
    202: {
      description: 'Snapshot build started',
      content: { 'application/json': { schema: SnapshotBuildResponseSchema } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const listSnapshotsRoute = createRoute({
  method: 'get',
  path: '/v1/snapshots',
  tags: ['Snapshots'],
  responses: {
    200: {
      description: 'List of snapshots',
      content: { 'application/json': { schema: SnapshotListResponseSchema } },
    },
  },
});
