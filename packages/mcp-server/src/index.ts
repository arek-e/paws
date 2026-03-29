#!/usr/bin/env node

/**
 * paws MCP server — lets AI agents manage servers, sessions, and daemons.
 *
 * Usage:
 *   PAWS_URL=http://localhost:4000 PAWS_API_KEY=... bunx @paws/mcp-server
 *
 * Claude Code:
 *   claude mcp add paws -- bunx @paws/mcp-server
 *
 * .mcp.json:
 *   {
 *     "mcpServers": {
 *       "paws": {
 *         "command": "bunx",
 *         "args": ["@paws/mcp-server"],
 *         "env": { "PAWS_URL": "http://...", "PAWS_API_KEY": "..." }
 *       }
 *     }
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from '@paws/sdk';

import { registerDaemonTools } from './tools/daemons.js';
import { registerFleetTools } from './tools/fleet.js';
import { registerServerTools } from './tools/servers.js';
import { registerSessionTools } from './tools/sessions.js';

const baseUrl = process.env['PAWS_URL'] ?? 'http://localhost:4000';
const apiKey = process.env['PAWS_API_KEY'] ?? '';

if (!apiKey) {
  process.stderr.write('paws MCP: PAWS_API_KEY is required. Set it as an environment variable.\n');
  process.exit(1);
}

const client = createClient({ baseUrl, apiKey });

const server = new McpServer({
  name: 'paws',
  version: '0.1.0',
});

// Register all tools
registerSessionTools(server, client);
registerDaemonTools(server, client);
registerFleetTools(server, client);
registerServerTools(server, { baseUrl, apiKey });

// Connect via stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
