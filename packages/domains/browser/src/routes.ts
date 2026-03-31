import { createRoute, z } from '@hono/zod-openapi';
import { ErrorResponseSchema } from '@paws/domain-common';
import {
  BrowserActionResultSchema,
  BrowserActionSchema,
  ScreenshotResponseSchema,
} from './types.js';

/** Execute a browser action (click, type, goto, screenshot, etc.) */
export const browserActionRoute = createRoute({
  method: 'post',
  path: '/v1/sessions/{id}/browser/action',
  tags: ['Browser'],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: BrowserActionSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Action executed',
      content: { 'application/json': { schema: BrowserActionResultSchema } },
    },
    404: {
      description: 'Session not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    400: {
      description: 'Browser not enabled for this session',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

/** Take a screenshot of the current browser state */
export const browserScreenshotRoute = createRoute({
  method: 'get',
  path: '/v1/sessions/{id}/browser/screenshot',
  tags: ['Browser'],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Screenshot captured',
      content: { 'application/json': { schema: ScreenshotResponseSchema } },
    },
    404: {
      description: 'Session not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    400: {
      description: 'Browser not enabled for this session',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
