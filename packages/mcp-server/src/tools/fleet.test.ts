import { describe, expect, test, vi } from 'vitest';

import { registerFleetTools } from './fleet.js';

function okResult<T>(value: T) {
  return { isOk: () => true, value, error: undefined };
}

function createMockServer() {
  const tools: { name: string }[] = [];
  return {
    tool: vi.fn((name: string, _desc: string, _schema: unknown, _handler: unknown) => {
      tools.push({ name });
    }),
    tools,
  };
}

function createMockClient() {
  return {
    fleet: {
      overview: vi.fn(async () =>
        okResult({ totalWorkers: 2, healthyWorkers: 2, totalCapacity: 10, usedCapacity: 3 }),
      ),
      workers: vi.fn(async () => okResult({ workers: [] })),
      cost: vi.fn(async () => okResult({ totalVcpuSeconds: 0, daemons: {} })),
    },
    snapshots: {
      list: vi.fn(async () => okResult({ snapshots: [] })),
    },
  };
}

describe('registerFleetTools', () => {
  test('registers all four fleet tools', () => {
    const server = createMockServer();
    registerFleetTools(server as never, createMockClient() as never);

    expect(server.tool).toHaveBeenCalledTimes(4);
    const names = server.tools.map((t) => t.name);
    expect(names).toContain('fleet-overview');
    expect(names).toContain('list-workers');
    expect(names).toContain('cost-summary');
    expect(names).toContain('list-snapshots');
  });

  test('fleet-overview handler returns formatted JSON content', async () => {
    const server = createMockServer();
    const client = createMockClient();
    registerFleetTools(server as never, client as never);

    const handler = server.tool.mock.calls[0]![3] as () => Promise<{
      content: { text: string }[];
    }>;
    const result = await handler();

    expect(client.fleet.overview).toHaveBeenCalled();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.totalWorkers).toBe(2);
    expect(parsed.healthyWorkers).toBe(2);
  });
});
