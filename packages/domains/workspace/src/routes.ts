import { createRoute, z } from '@hono/zod-openapi';
import { ErrorResponseSchema } from '@paws/domain-common';
import {
  CreateWorkspaceRequestSchema,
  UpdateWorkspaceRequestSchema,
  WorkspaceListResponseSchema,
  WorkspaceSchema,
} from './types.js';

export const createWorkspaceRoute = createRoute({
  method: 'post',
  path: '/v1/workspaces',
  tags: ['Workspaces'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateWorkspaceRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Workspace created',
      content: { 'application/json': { schema: WorkspaceSchema } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Workspace name already exists',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const listWorkspacesRoute = createRoute({
  method: 'get',
  path: '/v1/workspaces',
  tags: ['Workspaces'],
  responses: {
    200: {
      description: 'List of workspaces',
      content: { 'application/json': { schema: WorkspaceListResponseSchema } },
    },
  },
});

export const getWorkspaceRoute = createRoute({
  method: 'get',
  path: '/v1/workspaces/{id}',
  tags: ['Workspaces'],
  request: {
    params: z.object({ id: z.string().min(1) }),
  },
  responses: {
    200: {
      description: 'Workspace detail',
      content: { 'application/json': { schema: WorkspaceSchema } },
    },
    404: {
      description: 'Workspace not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const updateWorkspaceRoute = createRoute({
  method: 'put',
  path: '/v1/workspaces/{id}',
  tags: ['Workspaces'],
  request: {
    params: z.object({ id: z.string().min(1) }),
    body: {
      content: {
        'application/json': {
          schema: UpdateWorkspaceRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Workspace updated',
      content: { 'application/json': { schema: WorkspaceSchema } },
    },
    404: {
      description: 'Workspace not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const deleteWorkspaceRoute = createRoute({
  method: 'delete',
  path: '/v1/workspaces/{id}',
  tags: ['Workspaces'],
  request: {
    params: z.object({ id: z.string().min(1) }),
  },
  responses: {
    200: {
      description: 'Workspace deleted',
      content: {
        'application/json': {
          schema: z.object({
            id: z.string(),
            deleted: z.literal(true),
          }),
        },
      },
    },
    404: {
      description: 'Workspace not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
