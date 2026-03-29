import type { McpServerConfig } from '@paws/types';

export interface McpServerStore {
  add(config: McpServerConfig): void;
  get(name: string): McpServerConfig | undefined;
  list(): McpServerConfig[];
  delete(name: string): boolean;
}

/** In-memory MCP server store */
export function createMcpServerStore(): McpServerStore {
  const servers = new Map<string, McpServerConfig>();

  return {
    add(config) {
      servers.set(config.name, config);
    },
    get(name) {
      return servers.get(name);
    },
    list() {
      return Array.from(servers.values());
    },
    delete(name) {
      return servers.delete(name);
    },
  };
}
