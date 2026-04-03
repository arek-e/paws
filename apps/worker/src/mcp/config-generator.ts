import { createLogger } from '@paws/logger';
import type { McpServerConfig } from '@paws/domain-mcp';

const log = createLogger('mcp-config');

/** Resolved MCP server with credentials for agentgateway */
export interface ResolvedMcpServer {
  name: string;
  transport: 'stdio' | 'sse' | 'streamable-http';
  /** For stdio transport */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** For SSE/streamable-http transport */
  url?: string;
  /** Credential to inject on outbound requests */
  backendAuth?: {
    type: 'header';
    header: string;
    value: string;
  };
}

/** A session's MCP route configuration for agentgateway */
export interface SessionMcpConfig {
  sessionId: string;
  servers: ResolvedMcpServer[];
}

/**
 * Generate an agentgateway route block for a session.
 *
 * Each session gets a path-prefix route (`/{sessionId}/mcp`) that multiplexes
 * all configured MCP servers. agentgateway handles tool discovery aggregation
 * and credential injection.
 */
export function generateSessionRoute(config: SessionMcpConfig): AgentgatewayRoute {
  const targets = config.servers.map((server) => {
    if (server.transport === 'stdio') {
      const target: Record<string, unknown> = {
        name: `${config.sessionId}-${server.name}`,
        stdio: {
          cmd: server.command!,
          ...(server.args?.length ? { args: server.args } : {}),
          ...(server.env ? { env: server.env } : {}),
        },
      };
      return target;
    }

    // SSE or streamable-http
    const target: Record<string, unknown> = {
      name: `${config.sessionId}-${server.name}`,
    };

    if (server.transport === 'sse') {
      target.sse = { host: server.url! };
    } else {
      target.mcp = { host: server.url! };
    }

    return target;
  });

  const route: AgentgatewayRoute = {
    name: `session-${config.sessionId}`,
    matches: [{ path: { pathPrefix: `/${config.sessionId}` } }],
    backends: [{ mcp: { targets } }],
  };

  // Add backend auth policies for servers with credentials
  const serversWithAuth = config.servers.filter((s) => s.backendAuth);
  if (serversWithAuth.length > 0) {
    const auth = serversWithAuth[0]!.backendAuth!;
    route.policies = {
      backendAuth: {
        key: { value: auth.value },
      },
      requestHeaderModifier: {
        set: [{ name: auth.header, value: auth.value }],
      },
    };
  }

  return route;
}

/** agentgateway route structure (subset of full config) */
export interface AgentgatewayRoute {
  name: string;
  matches: Array<{ path: { pathPrefix: string } }>;
  backends: Array<{ mcp: { targets: unknown[] } }>;
  policies?: Record<string, unknown>;
}

/**
 * Generate the full agentgateway config YAML with all active session routes.
 *
 * The worker calls this whenever sessions change (start/stop) and writes
 * the result to the config file. agentgateway hot-reloads automatically.
 */
export function generateFullConfig(
  sessions: Map<string, SessionMcpConfig>,
  port: number = 4317,
): string {
  const routes = Array.from(sessions.values()).map(generateSessionRoute);

  const config = {
    config: {
      adminAddr: 'localhost:15000',
      readinessAddr: '0.0.0.0:15020',
      statsAddr: '0.0.0.0:15021',
      logging: { level: 'info' },
    },
    binds: [
      {
        port,
        listeners: [
          {
            name: 'mcp-gateway',
            protocol: 'HTTP',
            routes,
          },
        ],
      },
    ],
  };

  return yamlStringify(config);
}

/**
 * Resolve MCP server configs with credentials for a session.
 *
 * Takes the daemon's allowed server names and the MCP server registry,
 * resolves credentials, and returns configs ready for agentgateway.
 */
export function resolveMcpServers(
  serverNames: string[],
  serverStore: ReadonlyMap<string, McpServerConfig>,
  resolvedCredentials?: Record<string, { header: string; value: string }>,
): ResolvedMcpServer[] {
  const resolved: ResolvedMcpServer[] = [];

  for (const name of serverNames) {
    const server = serverStore.get(name);
    if (!server) {
      log.warn('MCP server not found in registry, skipping', { name });
      continue;
    }

    const mcpServer: ResolvedMcpServer = {
      name: server.name,
      transport: server.transport,
    };

    if (server.transport === 'stdio') {
      if (server.command) mcpServer.command = server.command;
      if (server.args) mcpServer.args = server.args;
      if (server.env) mcpServer.env = server.env;
    } else {
      if (server.url) mcpServer.url = server.url;
    }

    // Attach credentials if available
    const cred = resolvedCredentials?.[name];
    if (cred) {
      mcpServer.backendAuth = {
        type: 'header',
        header: cred.header,
        value: cred.value,
      };
    }

    resolved.push(mcpServer);
  }

  return resolved;
}

/** Simple YAML serializer for agentgateway config (no external dependency) */
function yamlStringify(obj: unknown, indent: number = 0): string {
  const pad = '  '.repeat(indent);

  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map((item) => `${pad}- ${yamlStringify(item, indent + 1).trimStart()}`).join('\n');
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    return entries
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return `${pad}${key}:\n${yamlStringify(value, indent + 1)}`;
        }
        if (Array.isArray(value)) {
          if (value.length === 0) return `${pad}${key}: []`;
          return `${pad}${key}:\n${yamlStringify(value, indent + 1)}`;
        }
        return `${pad}${key}: ${yamlStringify(value, indent)}`;
      })
      .join('\n');
  }

  return String(obj);
}
