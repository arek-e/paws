import { createRoute, z } from '@hono/zod-openapi';
import { ErrorResponseSchema } from '@paws/domain-common';
import { WebhookTriggerResponseSchema } from '@paws/domain-daemon';

export const receiveWebhookRoute = createRoute({
  method: 'post',
  path: '/v1/webhooks/{role}',
  tags: ['Webhooks'],
  request: {
    params: z.object({ role: z.string().min(1) }),
  },
  responses: {
    202: {
      description: 'Webhook accepted, session created',
      content: { 'application/json': { schema: WebhookTriggerResponseSchema } },
    },
    404: {
      description: 'Daemon not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    429: {
      description: 'Rate limited',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
