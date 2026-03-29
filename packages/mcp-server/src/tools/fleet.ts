import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PawsClient } from '@paws/sdk';

function resultToContent<T>(result: { isOk(): boolean; value?: T; error?: { message: string } }) {
  if (result.isOk()) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(result.value, null, 2) }] };
  }
  return {
    content: [{ type: 'text' as const, text: `Error: ${result.error?.message}` }],
    isError: true as const,
  };
}

export function registerFleetTools(server: McpServer, client: PawsClient) {
  server.tool(
    'fleet-overview',
    'Get fleet health overview — worker count, active sessions, queue depth',
    {},
    async () => resultToContent(await client.fleet.overview()),
  );

  server.tool(
    'list-workers',
    'List all worker nodes with their health status and capacity',
    {},
    async () => resultToContent(await client.fleet.workers()),
  );

  server.tool('cost-summary', 'Get cost summary — vCPU-seconds usage by daemon', {}, async () =>
    resultToContent(await client.fleet.cost()),
  );

  server.tool('list-snapshots', 'List available VM snapshots', {}, async () =>
    resultToContent(await client.snapshots.list()),
  );
}
