import { createLogger } from '@paws/logger';
import type { McpServerConfig } from '@paws/domain-mcp';

import {
  generateFullConfig,
  resolveMcpServers,
  type SessionMcpConfig,
} from './config-generator.js';

const log = createLogger('mcp-gateway');

/** Configuration for the MCP gateway manager */
export interface McpGatewayConfig {
  /** Path to agentgateway config file (hot-reloaded by agentgateway) */
  configPath: string;
  /** Port agentgateway listens on */
  port: number;
  /** Readiness probe URL */
  readinessUrl: string;
}

/** MCP gateway manager — tracks sessions and writes agentgateway config */
export interface McpGateway {
  /** Register a session's MCP servers with agentgateway */
  addSession(
    sessionId: string,
    serverNames: string[],
    serverStore: ReadonlyMap<string, McpServerConfig>,
    credentials?: Record<string, { header: string; value: string }>,
  ): Promise<void>;

  /** Remove a session's MCP config from agentgateway */
  removeSession(sessionId: string): Promise<void>;

  /** Get the MCP gateway URL for a session */
  getSessionUrl(sessionId: string): string | undefined;

  /** Check if agentgateway is healthy */
  isHealthy(): Promise<boolean>;

  /** Number of active MCP sessions */
  get sessionCount(): number;
}

const DEFAULT_CONFIG: McpGatewayConfig = {
  configPath: '/etc/agentgateway/config.yaml',
  port: 4317,
  readinessUrl: 'http://localhost:15020/healthz/ready',
};

/**
 * Create an MCP gateway manager.
 *
 * Manages the agentgateway config file: adds session routes on session start,
 * removes them on session end. agentgateway watches the file and hot-reloads.
 */
export function createMcpGateway(config: Partial<McpGatewayConfig> = {}): McpGateway {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const sessions = new Map<string, SessionMcpConfig>();

  async function writeConfig(): Promise<void> {
    const yaml = generateFullConfig(sessions, cfg.port);
    await Bun.write(cfg.configPath, yaml);
    log.info('Wrote agentgateway config', {
      path: cfg.configPath,
      sessions: sessions.size,
    });
  }

  return {
    async addSession(sessionId, serverNames, serverStore, credentials) {
      if (serverNames.length === 0) return;

      const servers = resolveMcpServers(serverNames, serverStore, credentials);
      if (servers.length === 0) {
        log.warn('No MCP servers resolved for session', { sessionId, requested: serverNames });
        return;
      }

      sessions.set(sessionId, { sessionId, servers });
      await writeConfig();

      log.info('Added MCP session to gateway', {
        sessionId,
        servers: servers.map((s) => s.name),
      });
    },

    async removeSession(sessionId) {
      if (!sessions.has(sessionId)) return;

      sessions.delete(sessionId);
      await writeConfig();

      log.info('Removed MCP session from gateway', { sessionId });
    },

    getSessionUrl(sessionId) {
      if (!sessions.has(sessionId)) return undefined;
      return `http://localhost:${cfg.port}/${sessionId}`;
    },

    async isHealthy() {
      try {
        const res = await fetch(cfg.readinessUrl, { signal: AbortSignal.timeout(2000) });
        return res.ok;
      } catch {
        return false;
      }
    },

    get sessionCount() {
      return sessions.size;
    },
  };
}
