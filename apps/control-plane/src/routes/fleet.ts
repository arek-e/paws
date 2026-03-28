import { createRoute } from '@hono/zod-openapi';
import { FleetOverviewSchema, WorkerListResponseSchema } from '@paws/types';

export const fleetOverviewRoute = createRoute({
  method: 'get',
  path: '/v1/fleet',
  tags: ['Fleet'],
  responses: {
    200: {
      description: 'Fleet overview',
      content: { 'application/json': { schema: FleetOverviewSchema } },
    },
  },
});

export const listWorkersRoute = createRoute({
  method: 'get',
  path: '/v1/fleet/workers',
  tags: ['Fleet'],
  responses: {
    200: {
      description: 'List of workers',
      content: { 'application/json': { schema: WorkerListResponseSchema } },
    },
  },
});
