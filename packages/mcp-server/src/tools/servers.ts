import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

interface ServerToolsConfig {
  baseUrl: string;
  apiKey: string;
}

async function apiCall(config: ServerToolsConfig, method: string, path: string, body?: unknown) {
  const res = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) {
    return {
      content: [{ type: 'text' as const, text: `Error (${res.status}): ${JSON.stringify(data)}` }],
      isError: true as const,
    };
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export function registerServerTools(server: McpServer, config: ServerToolsConfig) {
  server.tool(
    'test-connection',
    'Test SSH connectivity to a server before adding it',
    {
      ip: z.string().describe('Server IP address or hostname'),
      port: z.number().optional().describe('SSH port (default: 22)'),
      username: z.string().optional().describe('SSH username (default: root)'),
      authMethod: z
        .enum(['password', 'privateKey'])
        .optional()
        .describe('Authentication method (default: password)'),
      password: z.string().optional().describe('SSH password (for password auth)'),
      privateKey: z.string().optional().describe('SSH private key PEM content (for key auth)'),
    },
    async ({ ip, port, username, authMethod, password, privateKey }) =>
      apiCall(config, 'POST', '/v1/setup/servers/test-connection', {
        ip,
        port: port ?? 22,
        username: username ?? 'root',
        authMethod: authMethod ?? 'password',
        password,
        privateKey,
      }),
  );

  server.tool(
    'add-server',
    'Add a worker server to paws — connects via SSH and runs the bootstrap script',
    {
      name: z.string().describe('Server name (e.g. "worker-01")'),
      ip: z.string().describe('Server IP address'),
      authMethod: z
        .enum(['password', 'privateKey'])
        .optional()
        .describe('Authentication method (default: password)'),
      password: z.string().optional().describe('Root password (for password auth)'),
      privateKey: z.string().optional().describe('SSH private key PEM (for key auth)'),
      passphrase: z.string().optional().describe('Key passphrase (if encrypted)'),
      port: z.number().optional().describe('SSH port (default: 22)'),
      username: z.string().optional().describe('SSH username (default: root)'),
    },
    async ({ name, ip, authMethod, password, privateKey, passphrase, port, username }) =>
      apiCall(config, 'POST', '/v1/setup/servers', {
        provider: 'manual',
        name,
        ip,
        authMethod: authMethod ?? 'password',
        password,
        privateKey,
        passphrase,
        port: port ?? 22,
        username: username ?? 'root',
      }),
  );

  server.tool(
    'add-server-ec2',
    'Launch and bootstrap an AWS EC2 instance as a paws worker',
    {
      name: z.string().optional().describe('Server name (default: "aws-worker")'),
      accessKey: z.string().describe('AWS Access Key ID'),
      secretKey: z.string().describe('AWS Secret Access Key'),
      region: z.string().optional().describe('AWS region (default: us-east-1)'),
    },
    async ({ name, accessKey, secretKey, region }) =>
      apiCall(config, 'POST', '/v1/setup/servers', {
        provider: 'aws-ec2',
        name: name ?? 'aws-worker',
        awsAccessKey: accessKey,
        awsSecretKey: secretKey,
        region: region ?? 'us-east-1',
      }),
  );

  server.tool(
    'list-servers',
    'List all registered worker servers with their status',
    {},
    async () => apiCall(config, 'GET', '/v1/servers'),
  );

  server.tool(
    'delete-server',
    'Remove a server from paws',
    { id: z.string().describe('Server ID to delete') },
    async ({ id }) => apiCall(config, 'DELETE', `/v1/setup/servers/${id}`),
  );
}
