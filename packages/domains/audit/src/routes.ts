import { createRoute, z } from '@hono/zod-openapi';

const AuditEventSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string(),
  category: z.enum(['session', 'daemon', 'server', 'auth', 'system']),
  action: z.string(),
  actor: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  severity: z.enum(['info', 'warn', 'error']),
});

const AuditListResponseSchema = z.object({
  events: z.array(AuditEventSchema),
  total: z.number(),
});

const AuditStatsSchema = z.object({
  last24h: z.record(z.string(), z.number()),
  last7d: z.record(z.string(), z.number()),
  total: z.number(),
});

export const listAuditRoute = createRoute({
  method: 'get',
  path: '/v1/audit',
  tags: ['Audit'],
  request: {
    query: z.object({
      category: z.string().optional(),
      action: z.string().optional(),
      resourceType: z.string().optional(),
      resourceId: z.string().optional(),
      severity: z.string().optional(),
      search: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
      offset: z.coerce.number().int().min(0).default(0).optional(),
      since: z.string().optional(),
      until: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Audit event list',
      content: { 'application/json': { schema: AuditListResponseSchema } },
    },
  },
});

export const auditStatsRoute = createRoute({
  method: 'get',
  path: '/v1/audit/stats',
  tags: ['Audit'],
  responses: {
    200: {
      description: 'Audit event statistics',
      content: { 'application/json': { schema: AuditStatsSchema } },
    },
  },
});
