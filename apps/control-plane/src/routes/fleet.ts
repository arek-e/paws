import { createRoute } from '@hono/zod-openapi';
import { CostSummarySchema, FleetOverviewSchema, WorkerListResponseSchema } from '@paws/types';

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

export const costSummaryRoute = createRoute({
  method: 'get',
  path: '/v1/fleet/cost',
  tags: ['Fleet'],
  responses: {
    200: {
      description: 'Fleet-wide cost summary (vCPU-seconds by daemon)',
      content: { 'application/json': { schema: CostSummarySchema } },
    },
  },
});
