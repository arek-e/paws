import { describe, expect, test, vi } from 'vitest';

import { registerDaemonTools } from './daemons.js';

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
    daemons: {
      list: vi.fn(async () => okResult({ daemons: [] })),
      get: vi.fn(async () => okResult({ role: 'test', status: 'active' })),
      create: vi.fn(async () => okResult({ role: 'test', status: 'active' })),
      update: vi.fn(async () => okResult({ role: 'test', description: 'updated' })),
      delete: vi.fn(async () => okResult({ role: 'test', status: 'stopped' })),
      ...overrides,
    },
    webhooks: {
      trigger: vi.fn(async () => okResult({ accepted: true, sessionId: 'sess-1' })),
      ...overrides,
    },
  };
}

describe('registerDaemonTools', () => {
  test('registers all six daemon tools', () => {
    const server = createMockServer();
    registerDaemonTools(server as never, createMockClient() as never);

    expect(server.tool).toHaveBeenCalledTimes(6);
    const names = server.tools.map((t) => t.name);
    expect(names).toContain('list-daemons');
    expect(names).toContain('get-daemon');
    expect(names).toContain('create-daemon');
    expect(names).toContain('update-daemon');
    expect(names).toContain('delete-daemon');
    expect(names).toContain('trigger-webhook');
  });

  test('create-daemon handler builds webhook trigger by default', async () => {
    const server = createMockServer();
    const client = createMockClient();
    registerDaemonTools(server as never, client as never);

    // create-daemon is the 3rd registered tool
    const handler = server.tool.mock.calls[2]![3] as (args: {
      role: string;
      snapshot: string;
      triggerType: 'webhook' | 'schedule';
      description?: string;
      schedule?: string;
    }) => Promise<unknown>;
    await handler({ role: 'my-daemon', snapshot: 'snap', triggerType: 'webhook' });

    expect(client.daemons.create).toHaveBeenCalledWith({
      role: 'my-daemon',
      description: undefined,
      snapshot: 'snap',
      trigger: { type: 'webhook' },
    });
  });

  test('create-daemon handler builds schedule trigger with cron', async () => {
    const server = createMockServer();
    const client = createMockClient();
    registerDaemonTools(server as never, client as never);

    const handler = server.tool.mock.calls[2]![3] as (args: {
      role: string;
      snapshot: string;
      triggerType: 'webhook' | 'schedule';
      schedule?: string;
    }) => Promise<unknown>;
    await handler({
      role: 'cron-daemon',
      snapshot: 'snap',
      triggerType: 'schedule',
      schedule: '*/5 * * * *',
    });

    expect(client.daemons.create).toHaveBeenCalledWith({
      role: 'cron-daemon',
      description: undefined,
      snapshot: 'snap',
      trigger: { type: 'schedule', schedule: '*/5 * * * *' },
    });
  });

  test('trigger-webhook handler parses JSON payload', async () => {
    const server = createMockServer();
    const client = createMockClient();
    registerDaemonTools(server as never, client as never);

    // trigger-webhook is the 6th (last) registered tool
    const handler = server.tool.mock.calls[5]![3] as (args: {
      role: string;
      payload?: string;
    }) => Promise<unknown>;
    await handler({ role: 'test', payload: '{"event":"push"}' });

    expect(client.webhooks.trigger).toHaveBeenCalledWith('test', { event: 'push' });
  });

  test('error result returns isError content', async () => {
    const server = createMockServer();
    const client = createMockClient({
      list: vi.fn(async () => errResult('Unauthorized')),
    });
    registerDaemonTools(server as never, client as never);

    const handler = server.tool.mock.calls[0]![3] as () => Promise<{
      isError: boolean;
      content: { text: string }[];
    }>;
    const result = await handler();

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Unauthorized');
  });
});
