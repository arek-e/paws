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

const sessionMcpCallRoute = createRoute({
  method: 'post',
  path: '/v1/sessions/{id}/mcp',
  tags: ['MCP'],
  request: {
    params: z.object({ id: z.string().uuid() }),
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
    501: {
      description: 'MCP protocol handling not yet implemented',
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

  // --- POST /v1/sessions/:id/mcp ---

  app.openapi(sessionMcpCallRoute, (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');

    // Verify session exists
    const session = sessionStore.get(id);
    if (!session) {
      return c.json(
        { error: { code: 'NOT_FOUND' as const, message: `Session ${id} not found` } },
        404,
      );
    }

    // Verify MCP server exists
    const mcpServer = mcpServerStore.get(body.server);
    if (!mcpServer) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND' as const,
            message: `MCP server "${body.server}" not found`,
          },
        },
        404,
      );
    }

    // Check session is authorized to access this MCP server
    const allowedServers = session.request.network?.mcp?.servers ?? [];
    if (allowedServers.length > 0 && !allowedServers.includes(body.server)) {
      return c.json(
        {
          error: {
            code: 'FORBIDDEN' as const,
            message: `Session not authorized to access MCP server "${body.server}"`,
          },
        },
        403,
      );
    }

    // Actual MCP protocol handling is deferred — return 501 for now
    // Future: spawn stdio process, connect to SSE/streamable-http endpoint,
    // forward the JSON-RPC method call, return the result
    return c.json(
      {
        error: {
          code: 'NOT_IMPLEMENTED' as const,
          message:
            'MCP protocol handling is not yet implemented. Server configuration and routing are ready.',
        },
      },
      501,
    );
  });

  return app;
}
