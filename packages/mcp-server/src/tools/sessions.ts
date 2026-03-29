import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PawsClient } from '@paws/sdk';
import { z } from 'zod';

function resultToContent<T>(result: { isOk(): boolean; value?: T; error?: { message: string } }) {
  if (result.isOk()) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(result.value, null, 2) }] };
  }
  return {
    content: [{ type: 'text' as const, text: `Error: ${result.error?.message}` }],
    isError: true as const,
  };
}

export function registerSessionTools(server: McpServer, client: PawsClient) {
  server.tool(
    'list-sessions',
    'List recent paws sessions with their status and output',
    { limit: z.number().optional().describe('Maximum sessions to return (default: 50)') },
    async ({ limit }) => resultToContent(await client.sessions.list({ limit })),
  );

  server.tool(
    'create-session',
    'Create a new paws session — runs a workload in an isolated Firecracker VM',
    {
      snapshot: z.string().describe('Snapshot ID (e.g. "agent-latest", "test-minimal")'),
      script: z.string().describe('Shell script to execute inside the VM'),
      timeoutMs: z
        .number()
        .optional()
        .describe('Timeout in milliseconds (default: 600000 = 10 min)'),
    },
    async ({ snapshot, script, timeoutMs }) =>
      resultToContent(
        await client.sessions.create({
          snapshot,
          workload: { type: 'script', script },
          ...(timeoutMs ? { timeoutMs } : {}),
        }),
      ),
  );

  server.tool(
    'get-session',
    'Get details and output for a specific session',
    { id: z.string().describe('Session ID (UUID)') },
    async ({ id }) => resultToContent(await client.sessions.get(id)),
  );

  server.tool(
    'cancel-session',
    'Cancel a running or pending session',
    { id: z.string().describe('Session ID to cancel') },
    async ({ id }) => resultToContent(await client.sessions.cancel(id)),
  );

  server.tool(
    'wait-for-session',
    'Wait for a session to reach a terminal state (completed, failed, timeout, cancelled)',
    {
      id: z.string().describe('Session ID to wait for'),
      timeoutMs: z
        .number()
        .optional()
        .describe('Maximum wait time in ms (default: 600000 = 10 min)'),
    },
    async ({ id, timeoutMs }) =>
      resultToContent(
        await client.sessions.waitForCompletion(id, timeoutMs ? { timeoutMs } : undefined),
      ),
  );
}
