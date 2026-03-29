import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PawsClient, UpdateDaemonRequest } from '@paws/sdk';
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

export function registerDaemonTools(server: McpServer, client: PawsClient) {
  server.tool(
    'list-daemons',
    'List all configured daemons with their status and trigger configuration',
    {},
    async () => resultToContent(await client.daemons.list()),
  );

  server.tool(
    'get-daemon',
    'Get detailed info about a specific daemon including recent sessions',
    { role: z.string().describe('Daemon role identifier') },
    async ({ role }) => resultToContent(await client.daemons.get(role)),
  );

  server.tool(
    'create-daemon',
    'Create a new daemon — an always-on agent triggered by webhooks, cron, or events',
    {
      role: z.string().describe('Unique role identifier (e.g. "pr-reviewer")'),
      description: z.string().optional().describe('Human-readable description'),
      snapshot: z.string().describe('Snapshot ID for the VM image'),
      triggerType: z.enum(['webhook', 'schedule']).describe('How the daemon is triggered'),
      schedule: z
        .string()
        .optional()
        .describe('Cron expression (required if triggerType is "schedule")'),
    },
    async ({ role, description, snapshot, triggerType, schedule }) => {
      const trigger =
        triggerType === 'schedule'
          ? { type: 'schedule' as const, schedule: schedule ?? '0 * * * *' }
          : { type: 'webhook' as const };

      return resultToContent(
        await client.daemons.create({
          role,
          description,
          snapshot,
          trigger,
        }),
      );
    },
  );

  server.tool(
    'update-daemon',
    'Update a daemon configuration (description, trigger, governance)',
    {
      role: z.string().describe('Daemon role to update'),
      description: z.string().optional().describe('New description'),
    },
    async ({ role, description }) => {
      const patch: Record<string, unknown> = {};
      if (description) patch['description'] = description;
      return resultToContent(await client.daemons.update(role, patch as UpdateDaemonRequest));
    },
  );

  server.tool(
    'delete-daemon',
    'Stop and delete a daemon',
    { role: z.string().describe('Daemon role to delete') },
    async ({ role }) => resultToContent(await client.daemons.delete(role)),
  );

  server.tool(
    'trigger-webhook',
    'Trigger a daemon via its webhook endpoint with a payload',
    {
      role: z.string().describe('Daemon role to trigger'),
      payload: z.string().optional().describe('JSON payload to send (default: {})'),
    },
    async ({ role, payload }) => {
      const parsed = payload ? JSON.parse(payload) : {};
      return resultToContent(await client.webhooks.trigger(role, parsed));
    },
  );
}
