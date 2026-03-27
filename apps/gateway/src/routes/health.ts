import { createRoute, z } from '@hono/zod-openapi';

export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  responses: {
    200: {
      description: 'Gateway health status',
      content: {
        'application/json': {
          schema: z.object({
            status: z.string(),
            uptime: z.number(),
            version: z.string(),
          }),
        },
      },
    },
  },
});
