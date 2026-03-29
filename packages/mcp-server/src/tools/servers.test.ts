import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

import { registerServerTools } from './servers.js';

function createMockServer() {
  const tools: { name: string }[] = [];
  return {
    tool: vi.fn((name: string, _desc: string, _schema: unknown, _handler: unknown) => {
      tools.push({ name });
    }),
    tools,
  };
}

const CONFIG = { baseUrl: 'http://localhost:4000', apiKey: 'test-key' };

describe('registerServerTools', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('registers all five server tools', () => {
    const server = createMockServer();
    registerServerTools(server as never, CONFIG);

    expect(server.tool).toHaveBeenCalledTimes(5);
    const names = server.tools.map((t) => t.name);
    expect(names).toContain('test-connection');
    expect(names).toContain('add-server');
    expect(names).toContain('add-server-ec2');
    expect(names).toContain('list-servers');
    expect(names).toContain('delete-server');
  });

  test('add-server handler calls POST /v1/setup/servers', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ serverId: 'srv-1' }),
    });
    globalThis.fetch = mockFetch;

    const server = createMockServer();
    registerServerTools(server as never, CONFIG);

    // add-server is the 2nd registered tool
    const handler = server.tool.mock.calls[1]![3] as (args: {
      name: string;
      ip: string;
    }) => Promise<unknown>;
    const result = (await handler({ name: 'w1', ip: '10.0.0.1' })) as {
      content: { text: string }[];
    };

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4000/v1/setup/servers',
      expect.objectContaining({ method: 'POST' }),
    );
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.serverId).toBe('srv-1');
  });

  test('apiCall returns isError on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: 'NOT_FOUND' } }),
    });

    const server = createMockServer();
    registerServerTools(server as never, CONFIG);

    // list-servers is the 4th registered tool
    const handler = server.tool.mock.calls[3]![3] as () => Promise<{
      content: { text: string }[];
      isError: boolean;
    }>;
    const result = await handler();

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('404');
  });

  test('delete-server handler calls DELETE with server ID', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ serverId: 'srv-1', status: 'deleted' }),
    });
    globalThis.fetch = mockFetch;

    const server = createMockServer();
    registerServerTools(server as never, CONFIG);

    // delete-server is the 5th registered tool
    const handler = server.tool.mock.calls[4]![3] as (args: { id: string }) => Promise<unknown>;
    await handler({ id: 'srv-1' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4000/v1/setup/servers/srv-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
