import { describe, expect, test, vi } from 'vitest';

import { registerSessionTools } from './sessions.js';

// ---------------------------------------------------------------------------
// Helpers — mock neverthrow Result without importing it
// ---------------------------------------------------------------------------

function okResult<T>(value: T) {
  return { isOk: () => true, value, error: undefined };
}

function errResult(message: string) {
  return { isOk: () => false, value: undefined, error: { message } };
}

function createMockServer() {
  const tools: { name: string; description: string }[] = [];
  return {
    tool: vi.fn((name: string, description: string, _schema: unknown, _handler: unknown) => {
      tools.push({ name, description });
    }),
    tools,
  };
}

function createMockClient(overrides: Record<string, unknown> = {}) {
  return {
    sessions: {
      list: vi.fn(async () => okResult({ sessions: [] })),
      create: vi.fn(async () => okResult({ sessionId: 'sess-1', status: 'pending' })),
      get: vi.fn(async () => okResult({ sessionId: 'sess-1', status: 'completed' })),
      cancel: vi.fn(async () => okResult({ sessionId: 'sess-1', status: 'cancelled' })),
      waitForCompletion: vi.fn(async () => okResult({ sessionId: 'sess-1', status: 'completed' })),
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerSessionTools', () => {
  test('registers all five session tools', () => {
    const server = createMockServer();
    const client = createMockClient();

    registerSessionTools(server as never, client as never);

    expect(server.tool).toHaveBeenCalledTimes(5);
    const names = server.tools.map((t) => t.name);
    expect(names).toContain('list-sessions');
    expect(names).toContain('create-session');
    expect(names).toContain('get-session');
    expect(names).toContain('cancel-session');
    expect(names).toContain('wait-for-session');
  });

  test('list-sessions handler calls client and returns content', async () => {
    const server = createMockServer();
    const client = createMockClient();
    registerSessionTools(server as never, client as never);

    // Get the handler (4th argument of the first server.tool call)
    const handler = server.tool.mock.calls[0]![3] as (args: { limit?: number }) => Promise<unknown>;
    const result = await handler({ limit: 10 });

    expect(client.sessions.list).toHaveBeenCalledWith({ limit: 10 });
    expect(result).toEqual({
      content: [{ type: 'text', text: JSON.stringify({ sessions: [] }, null, 2) }],
    });
  });

  test('handler returns isError on failure', async () => {
    const server = createMockServer();
    const client = createMockClient({
      list: vi.fn(async () => errResult('Network error')),
    });
    registerSessionTools(server as never, client as never);

    const handler = server.tool.mock.calls[0]![3] as (args: { limit?: number }) => Promise<unknown>;
    const result = (await handler({})) as { content: { text: string }[]; isError: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Network error');
  });

  test('create-session handler passes snapshot and script', async () => {
    const server = createMockServer();
    const client = createMockClient();
    registerSessionTools(server as never, client as never);

    // create-session is the 2nd registered tool
    const handler = server.tool.mock.calls[1]![3] as (args: {
      snapshot: string;
      script: string;
      timeoutMs?: number;
    }) => Promise<unknown>;
    await handler({ snapshot: 'test-snap', script: 'echo hi' });

    expect(client.sessions.create).toHaveBeenCalledWith({
      snapshot: 'test-snap',
      workload: { type: 'script', script: 'echo hi' },
    });
  });

  test('create-session includes timeoutMs when provided', async () => {
    const server = createMockServer();
    const client = createMockClient();
    registerSessionTools(server as never, client as never);

    const handler = server.tool.mock.calls[1]![3] as (args: {
      snapshot: string;
      script: string;
      timeoutMs?: number;
    }) => Promise<unknown>;
    await handler({ snapshot: 'snap', script: 'ls', timeoutMs: 30000 });

    expect(client.sessions.create).toHaveBeenCalledWith({
      snapshot: 'snap',
      workload: { type: 'script', script: 'ls' },
      timeoutMs: 30000,
    });
  });
});
