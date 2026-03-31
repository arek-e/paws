import { createRoute, z } from '@hono/zod-openapi';
import { ErrorResponseSchema } from '@paws/domain-common';

const TemplateCategorySchema = z.enum(['code-review', 'devops', 'security', 'general']);

const DaemonTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: TemplateCategorySchema,
  icon: z.string(),
  defaults: z.record(z.string(), z.unknown()),
});

export const listTemplatesRoute = createRoute({
  method: 'get',
  path: '/v1/templates',
  tags: ['Templates'],
  request: {
    query: z.object({
      category: TemplateCategorySchema.optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of daemon templates',
      content: {
        'application/json': {
          schema: z.object({ templates: z.array(DaemonTemplateSchema) }),
        },
      },
    },
  },
});

export const getTemplateRoute = createRoute({
  method: 'get',
  path: '/v1/templates/{id}',
  tags: ['Templates'],
  request: {
    params: z.object({ id: z.string().min(1) }),
  },
  responses: {
    200: {
      description: 'Template detail',
      content: { 'application/json': { schema: DaemonTemplateSchema } },
    },
    404: {
      description: 'Template not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

export const deployTemplateRoute = createRoute({
  method: 'post',
  path: '/v1/templates/{id}/deploy',
  tags: ['Templates'],
  request: {
    params: z.object({ id: z.string().min(1) }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            role: z.string().min(1).optional(),
            snapshot: z.string().min(1).optional(),
            overrides: z.record(z.string(), z.unknown()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Daemon created from template',
      content: {
        'application/json': {
          schema: z.object({
            role: z.string(),
            status: z.literal('active'),
            createdAt: z.string(),
            templateId: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Template not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Daemon already exists',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
