import { z } from 'zod';

/** MCP server configuration */
export const McpServerConfigSchema = z.object({
  /** Unique name for this MCP server */
  name: z.string().min(1),
  /** Transport type */
  transport: z.enum(['stdio', 'sse', 'streamable-http']),
  /** For stdio: command to run on the host */
  command: z.string().optional(),
  /** For stdio: arguments */
  args: z.array(z.string()).optional(),
  /** For sse/streamable-http: URL of the MCP server */
  url: z.string().url().optional(),
  /** Environment variables for the MCP server process */
  env: z.record(z.string(), z.string()).optional(),
});

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

/** MCP tool call request (from VM agent to control plane) */
export const McpToolCallSchema = z.object({
  /** Name of the MCP server to route to */
  server: z.string().min(1),
  /** JSON-RPC method name */
  method: z.string().min(1),
  /** Method parameters */
  params: z.record(z.string(), z.unknown()).optional(),
});

export type McpToolCall = z.infer<typeof McpToolCallSchema>;

/** MCP tool call response */
export const McpToolCallResponseSchema = z.object({
  /** Whether the call succeeded */
  success: z.boolean(),
  /** Result payload from the MCP server */
  result: z.unknown().optional(),
  /** Error message if the call failed */
  error: z.string().optional(),
});

export type McpToolCallResponse = z.infer<typeof McpToolCallResponseSchema>;
