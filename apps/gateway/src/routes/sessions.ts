import { createRoute, z } from '@hono/zod-openapi';
import {
  CancelSessionResponseSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  ErrorResponseSchema,
  SessionListResponseSchema,
  SessionSchema,
} from '@paws/types';

export const createSessionRoute = createRoute({
  method: 'post',
  path: '/v1/sessions',
  tags: ['Sessions'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateSessionRequestSchema,
        },
      },
    },
  },
  responses: {
    202: {
      description: 'Session created and queued',
      content: { 'application/json': { schema: CreateSessionResponseSchema } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    503: {
      description: 'Capacity exhausted',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const listSessionsRoute = createRoute({
  method: 'get',
  path: '/v1/sessions',
  tags: ['Sessions'],
  request: {
    query: z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of sessions',
      content: { 'application/json': { schema: SessionListResponseSchema } },
    },
  },
});

export const getSessionRoute = createRoute({
  method: 'get',
  path: '/v1/sessions/{id}',
  tags: ['Sessions'],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Session details',
      content: { 'application/json': { schema: SessionSchema } },
    },
    404: {
      description: 'Session not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const cancelSessionRoute = createRoute({
  method: 'delete',
  path: '/v1/sessions/{id}',
  tags: ['Sessions'],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Session cancelled',
      content: { 'application/json': { schema: CancelSessionResponseSchema } },
    },
    404: {
      description: 'Session not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
