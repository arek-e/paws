import { createRoute, z } from '@hono/zod-openapi';
import { OpenAPIHono } from '@hono/zod-openapi';
import { ErrorResponseSchema } from '@paws/domain-common';
import {
  McpServerConfigSchema,
  McpToolCallSchema,
  McpToolCallResponseSchema,
} from '@paws/domain-mcp';
import type { McpServerStore } from '@paws/domain-mcp';
import type { SessionStore } from '@paws/domain-session';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const McpServerListResponseSchema = z.object({
  servers: z.array(McpServerConfigSchema),
});

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const listMcpServersRoute = createRoute({
  method: 'get',
  path: '/v1/mcp/servers',
  tags: ['MCP'],
  responses: {
    200: {
      description: 'List of configured MCP servers',
      content: { 'application/json': { schema: McpServerListResponseSchema } },
    },
  },
});

const addMcpServerRoute = createRoute({
  method: 'post',
  path: '/v1/mcp/servers',
  tags: ['MCP'],
  request: {
    body: {
      content: {
        'application/json': { schema: McpServerConfigSchema },
      },
    },
  },
  responses: {
    201: {
      description: 'MCP server added',
      content: {
        'application/json': {
          schema: z.object({ name: z.string(), status: z.literal('added') }),
        },
      },
    },
    409: {
      description: 'MCP server with this name already exists',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const deleteMcpServerRoute = createRoute({
  method: 'delete',
  path: '/v1/mcp/servers/{name}',
  tags: ['MCP'],
  request: {
    params: z.object({ name: z.string().min(1) }),
  },
  responses: {
    200: {
      description: 'MCP server removed',
      content: {
        'application/json': {
          schema: z.object({ name: z.string(), status: z.literal('deleted') }),
        },
      },
    },
    404: {
      description: 'MCP server not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

/** Get resolved MCP server configs for a session (called by workers at session start) */
const sessionMcpConfigRoute = createRoute({
  method: 'get',
  path: '/v1/sessions/{id}/mcp/config',
  tags: ['MCP'],
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: 'Resolved MCP server configs for this session',
      content: {
        'application/json': {
          schema: z.object({ servers: z.array(McpServerConfigSchema) }),
        },
      },
    },
    404: {
      description: 'Session not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

/** Direct MCP tool call (deprecated — use agentgateway instead) */
const sessionMcpCallRoute = createRoute({
  method: 'post',
  path: '/v1/sessions/{id}/mcp',
  tags: ['MCP'],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': { schema: McpToolCallSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'MCP tool call result',
      content: { 'application/json': { schema: McpToolCallResponseSchema } },
    },
    404: {
      description: 'Session or MCP server not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Session not authorized to access this MCP server',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    410: {
      description: 'MCP calls go through agentgateway, not the control plane',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface McpRouteDeps {
  mcpServerStore: McpServerStore;
  sessionStore: SessionStore;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMcpRoutes(deps: McpRouteDeps) {
  const { mcpServerStore, sessionStore } = deps;
  const app = new OpenAPIHono();

  // --- GET /v1/mcp/servers ---

  app.openapi(listMcpServersRoute, (c) => {
    return c.json({ servers: mcpServerStore.list() }, 200);
  });

  // --- POST /v1/mcp/servers ---

  app.openapi(addMcpServerRoute, (c) => {
    const config = c.req.valid('json');

    if (mcpServerStore.get(config.name)) {
      return c.json(
        {
          error: {
            code: 'CONFLICT' as const,
            message: `MCP server "${config.name}" already exists`,
          },
        },
        409,
      );
    }

    mcpServerStore.add(config);
    return c.json({ name: config.name, status: 'added' as const }, 201);
  });

  // --- DELETE /v1/mcp/servers/:name ---

  app.openapi(deleteMcpServerRoute, (c) => {
    const { name } = c.req.valid('param');
    if (!mcpServerStore.delete(name)) {
      return c.json(
        { error: { code: 'NOT_FOUND' as const, message: `MCP server "${name}" not found` } },
        404,
      );
    }
    return c.json({ name, status: 'deleted' as const }, 200);
  });

  // --- GET /v1/sessions/:id/mcp/config ---
  // Workers call this at session start to get resolved MCP server configs

  app.openapi(sessionMcpConfigRoute, (c) => {
    const { id } = c.req.valid('param');

    const session = sessionStore.get(id);
    if (!session) {
      return c.json(
        { error: { code: 'NOT_FOUND' as const, message: `Session ${id} not found` } },
        404,
      );
    }

    // Resolve which MCP servers this session can access
    const allowedServerNames = session.request.network?.mcp?.servers ?? [];
    const servers = allowedServerNames
      .map((name) => mcpServerStore.get(name))
      .filter((s): s is NonNullable<typeof s> => s != null);

    return c.json({ servers }, 200);
  });

  // --- POST /v1/sessions/:id/mcp ---
  // Deprecated: MCP tool calls go through agentgateway on the worker, not the control plane

  app.openapi(sessionMcpCallRoute, (c) => {
    const { id } = c.req.valid('param');

    const session = sessionStore.get(id);
    if (!session) {
      return c.json(
        { error: { code: 'NOT_FOUND' as const, message: `Session ${id} not found` } },
        404,
      );
    }

    return c.json(
      {
        error: {
          code: 'NOT_FOUND' as const,
          message:
            'MCP tool calls are handled by agentgateway on the worker node. ' +
            'The agent in the VM calls GATEWAY_MCP_URL directly. ' +
            'Use GET /v1/sessions/{id}/mcp/config to fetch the MCP config for a session.',
        },
      },
      404,
    );
  });

  return app;
}
