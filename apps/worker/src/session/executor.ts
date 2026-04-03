import type { CreateSessionRequest } from '@paws/domain-session';
import type { NetworkConfig } from '@paws/domain-network';
import type { McpServerConfig } from '@paws/domain-mcp';
import type { McpGateway } from '../mcp/gateway.js';
import type {
  RuntimeAdapter,
  RuntimeSessionRequest,
  ResolvedCredentials,
  SessionResult,
  ExposedPortResult,
  PortExposureProvider,
} from '@paws/runtime';

import type { Semaphore } from '../semaphore.js';

/** LLM gateway plugin — intercepts LLM API calls and routes through an external proxy */
export interface LlmGateway {
  /** Display name (e.g., "LiteLLM", "OpenRouter") */
  name: string;
  /** Base URL of the gateway (e.g., "http://litellm:4001", "https://openrouter.ai/api") */
  url: string;
  /** API key for the gateway */
  apiKey: string;
  /** Which provider domains this gateway handles */
  domains: string[];
}

/** Configuration for the session executor */
export interface ExecutorConfig {
  /** Runtime adapter for session execution */
  runtime: RuntimeAdapter;
  /** Concurrency semaphore */
  semaphore: Semaphore;
  /** Worker name for session tracking */
  workerName: string;
  /** Port exposure provider (optional — needed for tunnel-based port exposure) */
  portExposure?: PortExposureProvider;
  /** LLM gateway — routes provider API calls through an external proxy */
  llmGateway?: LlmGateway;
  /** MCP gateway for secure MCP tool access (agentgateway) */
  mcpGateway?: McpGateway;
  /** MCP server store — registry of configured MCP servers with credentials */
  mcpServerStore?: ReadonlyMap<string, McpServerConfig>;
}

/** Result of a completed session (re-exported from runtime for convenience) */
export type { SessionResult } from '@paws/runtime';

/** Active session state for tracking */
export interface ActiveSession {
  sessionId: string;
  status: 'running' | 'stopping' | 'paused';
  startedAt: Date;
  exposedPorts?: ExposedPortResult[];
}

/** Create the session executor — thin wrapper around a RuntimeAdapter */
export function createExecutor(config: ExecutorConfig) {
  const sessions = new Map<string, ActiveSession>();

  return {
    /**
     * Execute a session through the runtime adapter.
     *
     * The executor handles:
     * - Semaphore-based concurrency control
     * - Converting CreateSessionRequest → RuntimeSessionRequest + ResolvedCredentials
     * - Delegating execution to the runtime adapter
     * - Session lifecycle tracking
     *
     * The runtime adapter handles the actual execution (VM lifecycle, networking, etc.)
     */
    async execute(sessionId: string, request: CreateSessionRequest): Promise<SessionResult> {
      const session: ActiveSession = { sessionId, status: 'running', startedAt: new Date() };
      sessions.set(sessionId, session);

      try {
        // Acquire semaphore slot
        await config.semaphore.acquire();

        // Convert domain request to runtime-agnostic format
        const runtimeRequest = toRuntimeRequest(request);
        const credentials = resolveCredentials(request.network, config.llmGateway);

        // Register MCP servers with agentgateway (if configured)
        const mcpServers = request.network?.mcp?.servers ?? [];
        if (mcpServers.length > 0 && config.mcpGateway && config.mcpServerStore) {
          await config.mcpGateway.addSession(sessionId, mcpServers, config.mcpServerStore);
          const mcpUrl = config.mcpGateway.getSessionUrl(sessionId);
          if (mcpUrl) {
            runtimeRequest.workload.env.GATEWAY_MCP_URL = mcpUrl;
          }
        }

        // Delegate to runtime adapter
        const result = await config.runtime.execute(
          sessionId,
          runtimeRequest,
          credentials,
          config.portExposure ? { portExposure: config.portExposure } : undefined,
        );

        if (result.isErr()) {
          throw result.error;
        }

        if (result.value.exposedPorts) {
          session.exposedPorts = result.value.exposedPorts;
        }
        return result.value;
      } finally {
        session.status = 'stopping';
        // Remove MCP session from agentgateway
        if (config.mcpGateway) {
          try {
            await config.mcpGateway.removeSession(sessionId);
          } catch {
            // Best-effort cleanup
          }
        }
        config.semaphore.release();
        sessions.delete(sessionId);
      }
    },

    /** Get all active sessions */
    get activeSessions(): ReadonlyMap<string, ActiveSession> {
      return sessions;
    },

    /** Runtime capabilities */
    get capabilities() {
      return config.runtime.capabilities;
    },

    /** Get connection info for a running session (for browser routes, port proxy, etc.) */
    getSessionConnection(sessionId: string) {
      return config.runtime.getSessionConnection?.(sessionId);
    },
  };
}

export type Executor = ReturnType<typeof createExecutor>;

/** Convert CreateSessionRequest to RuntimeSessionRequest */
function toRuntimeRequest(request: CreateSessionRequest): RuntimeSessionRequest {
  const expose = request.network?.expose;
  return {
    snapshot: request.snapshot,
    workload: {
      type: request.workload.type,
      script: request.workload.script,
      env: request.workload.env,
    },
    ...(request.resources ? { resources: request.resources } : {}),
    timeoutMs: request.timeoutMs,
    ...(expose
      ? {
          exposePorts: expose.map((ep) => ({
            port: ep.port,
            ...(ep.protocol ? { protocol: ep.protocol } : {}),
            ...(ep.label ? { label: ep.label } : {}),
            ...(ep.access ? { access: ep.access } : {}),
            ...(ep.allowedEmails ? { allowedEmails: ep.allowedEmails } : {}),
          })),
        }
      : {}),
    ...(request.stateVolumePath ? { stateVolumePath: request.stateVolumePath } : {}),
  };
}

/** Resolve credentials from NetworkConfig into runtime-agnostic format */
function resolveCredentials(
  network: NetworkConfig | undefined,
  gateway?: LlmGateway,
): ResolvedCredentials {
  const domains: ResolvedCredentials['domains'] = {};
  const allowlist: string[] = [];

  if (!network) {
    return { domains, allowlist };
  }

  // Add credential-bearing domains
  for (const [domain, cred] of Object.entries(network.credentials)) {
    domains[domain] = { headers: cred.headers };
  }

  // Add allowOut domains (no credentials)
  for (const domain of network.allowOut) {
    if (domain in domains) continue;
    allowlist.push(domain);
  }

  // If an LLM gateway is configured, override matching domains to route through it
  if (gateway) {
    for (const domain of gateway.domains) {
      domains[domain] = {
        headers: {
          ...(domains[domain]?.headers ?? {}),
          Authorization: `Bearer ${gateway.apiKey}`,
        },
        target: gateway.url,
      };
    }
  }

  return { domains, allowlist };
}
