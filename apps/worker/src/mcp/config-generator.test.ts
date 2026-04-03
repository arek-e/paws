import { describe, expect, it } from 'vitest';

import {
  generateSessionRoute,
  generateFullConfig,
  resolveMcpServers,
  type SessionMcpConfig,
} from './config-generator.js';

describe('generateSessionRoute', () => {
  it('generates a route for streamable-http MCP servers', () => {
    const config: SessionMcpConfig = {
      sessionId: 'abc123',
      servers: [
        {
          name: 'github',
          transport: 'streamable-http',
          url: 'https://api.githubcopilot.com/mcp/',
          backendAuth: {
            type: 'header',
            header: 'Authorization',
            value: 'Bearer ghp_test123',
          },
        },
      ],
    };

    const route = generateSessionRoute(config);

    expect(route.name).toBe('session-abc123');
    expect(route.matches[0]!.path.pathPrefix).toBe('/abc123');
    expect(route.backends[0]!.mcp.targets).toHaveLength(1);
    expect(route.policies).toBeDefined();
  });

  it('generates a route for stdio MCP servers', () => {
    const config: SessionMcpConfig = {
      sessionId: 'xyz789',
      servers: [
        {
          name: 'filesystem',
          transport: 'stdio',
          command: 'npx',
          args: ['@modelcontextprotocol/server-filesystem', '/workspace'],
        },
      ],
    };

    const route = generateSessionRoute(config);

    expect(route.name).toBe('session-xyz789');
    const target = route.backends[0]!.mcp.targets[0] as Record<string, unknown>;
    expect(target.name).toBe('xyz789-filesystem');
    expect(target.stdio).toBeDefined();
    expect(route.policies).toBeUndefined();
  });

  it('generates a route with multiple backends', () => {
    const config: SessionMcpConfig = {
      sessionId: 'multi',
      servers: [
        { name: 'github', transport: 'streamable-http', url: 'https://github.com/mcp' },
        { name: 'linear', transport: 'sse', url: 'https://mcp.linear.app/sse' },
      ],
    };

    const route = generateSessionRoute(config);

    expect(route.backends[0]!.mcp.targets).toHaveLength(2);
  });
});

describe('generateFullConfig', () => {
  it('generates valid config with no sessions', () => {
    const sessions = new Map<string, SessionMcpConfig>();
    const yaml = generateFullConfig(sessions);

    expect(yaml).toContain('port: 4317');
    expect(yaml).toContain('mcp-gateway');
    expect(yaml).toContain('routes: []');
  });

  it('generates config with active sessions', () => {
    const sessions = new Map<string, SessionMcpConfig>();
    sessions.set('sess1', {
      sessionId: 'sess1',
      servers: [{ name: 'github', transport: 'streamable-http', url: 'https://github.com/mcp' }],
    });

    const yaml = generateFullConfig(sessions);

    expect(yaml).toContain('session-sess1');
    expect(yaml).toContain('/sess1');
  });
});

describe('resolveMcpServers', () => {
  it('resolves servers from store with credentials', () => {
    const store = new Map([
      [
        'github',
        {
          name: 'github',
          transport: 'streamable-http' as const,
          url: 'https://api.githubcopilot.com/mcp/',
        },
      ],
      [
        'linear',
        {
          name: 'linear',
          transport: 'sse' as const,
          url: 'https://mcp.linear.app/sse',
        },
      ],
    ]);

    const credentials = {
      github: { header: 'Authorization', value: 'Bearer ghp_test' },
    };

    const resolved = resolveMcpServers(['github', 'linear'], store, credentials);

    expect(resolved).toHaveLength(2);
    expect(resolved[0]!.name).toBe('github');
    expect(resolved[0]!.backendAuth).toBeDefined();
    expect(resolved[0]!.backendAuth!.value).toBe('Bearer ghp_test');
    expect(resolved[1]!.name).toBe('linear');
    expect(resolved[1]!.backendAuth).toBeUndefined();
  });

  it('skips servers not in store', () => {
    const store = new Map([
      [
        'github',
        {
          name: 'github',
          transport: 'streamable-http' as const,
          url: 'https://github.com/mcp',
        },
      ],
    ]);

    const resolved = resolveMcpServers(['github', 'nonexistent'], store);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.name).toBe('github');
  });

  it('returns empty for empty server names', () => {
    const store = new Map();
    const resolved = resolveMcpServers([], store);
    expect(resolved).toHaveLength(0);
  });
});
