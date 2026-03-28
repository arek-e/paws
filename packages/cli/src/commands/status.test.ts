import { describe, expect, test } from 'vitest';
import type { FleetOverview, Session, WorkerListResponse } from '@paws/types';
import { buildBoxIds, formatStatusOutput } from './status.js';

function makeFleet(overrides: Partial<FleetOverview> = {}): FleetOverview {
  return {
    totalWorkers: 2,
    healthyWorkers: 2,
    totalCapacity: 10,
    usedCapacity: 3,
    queuedSessions: 0,
    activeDaemons: 2,
    activeSessions: 3,
    ...overrides,
  };
}

function makeWorkers(
  list: Array<{
    name?: string;
    status?: string;
    running?: number;
    max?: number;
    uptime?: number;
  }> = [],
): WorkerListResponse {
  return {
    workers: list.map((w) => ({
      name: w.name ?? 'http://127.0.0.1:3000',
      status: (w.status as 'healthy' | 'degraded' | 'unhealthy') ?? 'healthy',
      capacity: {
        maxConcurrent: w.max ?? 5,
        running: w.running ?? 0,
        queued: 0,
        available: (w.max ?? 5) - (w.running ?? 0),
      },
      snapshot: { id: 'agent-latest', version: 1, ageMs: 0 },
      uptime: w.uptime ?? 86400000,
    })),
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'a3f1e2b4-0000-0000-0000-000000000000',
    status: 'running',
    worker: 'http://127.0.0.1:3000',
    startedAt: new Date(Date.now() - 60000).toISOString(),
    ...overrides,
  };
}

describe('formatStatusOutput', () => {
  test('healthy fleet shows happy cat face', () => {
    const output = formatStatusOutput(
      makeFleet(),
      makeWorkers([
        { name: 'w1', running: 2 },
        { name: 'w2', running: 1 },
      ]),
      [makeSession()],
    );
    expect(output).toContain('( ^.^ )');
    expect(output).not.toContain('( o.o )!');
  });

  test('degraded worker shows alert cat face', () => {
    const output = formatStatusOutput(
      makeFleet({ healthyWorkers: 1 }),
      makeWorkers([
        { name: 'w1', status: 'healthy' },
        { name: 'w2', status: 'degraded' },
      ]),
      [],
    );
    expect(output).toContain('( o.o )!');
  });

  test('zero capacity shows alert cat face', () => {
    const output = formatStatusOutput(
      makeFleet({ totalCapacity: 5, usedCapacity: 5 }),
      makeWorkers([{ name: 'w1', running: 5, max: 5 }]),
      [],
    );
    expect(output).toContain('( o.o )!');
  });

  test('empty fleet shows no trees message', () => {
    const output = formatStatusOutput(
      makeFleet({
        totalWorkers: 0,
        healthyWorkers: 0,
        totalCapacity: 0,
        usedCapacity: 0,
        activeSessions: 0,
      }),
      makeWorkers([]),
      [],
    );
    expect(output).toContain('No trees in the fleet.');
    expect(output).toContain('0 trees, 0 kittens active');
  });

  test('summary line shows correct counts', () => {
    const output = formatStatusOutput(makeFleet(), makeWorkers([{ name: 'w1' }, { name: 'w2' }]), [
      makeSession(),
      makeSession({ sessionId: 'b2b2b2b2-0000-0000-0000-000000000000' }),
    ]);
    expect(output).toContain('2 trees, 2 kittens active');
  });

  test('singular tree and kitten', () => {
    const output = formatStatusOutput(
      makeFleet({ totalWorkers: 1 }),
      makeWorkers([{ name: 'w1' }]),
      [makeSession()],
    );
    expect(output).toContain('1 tree, 1 kitten active');
  });

  test('worker names map to tree-01, tree-02', () => {
    const output = formatStatusOutput(
      makeFleet(),
      makeWorkers([{ name: 'w1' }, { name: 'w2' }]),
      [],
    );
    expect(output).toContain('tree-01');
    expect(output).toContain('tree-02');
  });

  test('session IDs shorten to box-XXXX', () => {
    const output = formatStatusOutput(
      makeFleet(),
      makeWorkers([{ name: 'http://127.0.0.1:3000' }]),
      [makeSession({ sessionId: '7e22d901-0000-0000-0000-000000000000' })],
    );
    expect(output).toContain('box-7e22');
  });

  test('no active sessions shows message', () => {
    const output = formatStatusOutput(
      makeFleet({ activeSessions: 0 }),
      makeWorkers([{ name: 'w1' }]),
      [],
    );
    expect(output).toContain('No active kittens.');
  });

  test('null sessions shows unavailable note', () => {
    const output = formatStatusOutput(makeFleet(), makeWorkers([{ name: 'w1' }]), null);
    expect(output).toContain('ACTIVE KITTENS (unavailable)');
  });

  test('session with no worker shows ---', () => {
    const output = formatStatusOutput(makeFleet(), makeWorkers([{ name: 'w1' }]), [
      makeSession({ worker: undefined }),
    ]);
    expect(output).toMatch(/---/);
  });

  test('unhealthy count in summary', () => {
    const output = formatStatusOutput(
      makeFleet(),
      makeWorkers([
        { name: 'w1', status: 'healthy' },
        { name: 'w2', status: 'unhealthy' },
      ]),
      [],
    );
    expect(output).toContain('(1 tree unreachable)');
  });
});

describe('buildBoxIds', () => {
  test('shortens to 4 chars by default', () => {
    const ids = buildBoxIds([
      makeSession({ sessionId: 'a3f1e2b4-0000-0000-0000-000000000000' }),
      makeSession({ sessionId: 'b7c8d9e0-0000-0000-0000-000000000000' }),
    ]);
    expect(ids).toEqual(['box-a3f1', 'box-b7c8']);
  });

  test('extends to 6 chars on collision', () => {
    const ids = buildBoxIds([
      makeSession({ sessionId: 'a3f1e2b4-0000-0000-0000-000000000000' }),
      makeSession({ sessionId: 'a3f1ffff-0000-0000-0000-000000000000' }),
    ]);
    expect(ids).toEqual(['box-a3f1e2', 'box-a3f1ff']);
  });

  test('non-colliding IDs stay at 4 chars when others collide', () => {
    const ids = buildBoxIds([
      makeSession({ sessionId: 'a3f1e2b4-0000-0000-0000-000000000000' }),
      makeSession({ sessionId: 'a3f1ffff-0000-0000-0000-000000000000' }),
      makeSession({ sessionId: 'b7c8d9e0-0000-0000-0000-000000000000' }),
    ]);
    expect(ids[0]).toBe('box-a3f1e2');
    expect(ids[1]).toBe('box-a3f1ff');
    expect(ids[2]).toBe('box-b7c8');
  });
});
