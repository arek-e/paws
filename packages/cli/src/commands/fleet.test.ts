import { describe, it, expect, vi, beforeEach } from 'vitest';
import { okAsync, errAsync } from 'neverthrow';

import { fleetCommand } from './fleet.js';
import type { PawsClient } from '@paws/sdk';
import { PawsApiError } from '@paws/sdk';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockClient(overrides: Partial<PawsClient['fleet']> = {}): PawsClient {
  return {
    sessions: {} as PawsClient['sessions'],
    daemons: {} as PawsClient['daemons'],
    fleet: {
      overview: vi.fn().mockReturnValue(
        okAsync({
          totalWorkers: 2,
          healthyWorkers: 2,
          totalCapacity: 10,
          usedCapacity: 3,
          queuedSessions: 0,
          activeDaemons: 1,
          activeSessions: 3,
        }),
      ),
      workers: vi.fn().mockReturnValue(
        okAsync({
          workers: [{ name: 'worker-1', status: 'healthy' }],
        }),
      ),
      ...overrides,
    },
    snapshots: {} as PawsClient['snapshots'],
    webhooks: {} as PawsClient['webhooks'],
  } as PawsClient;
}

function args(action?: string, positional?: string, flags: Record<string, string> = {}) {
  return { resource: 'fleet', action, positional, flags };
}

let stdoutData: string;
let stderrData: string;

beforeEach(() => {
  stdoutData = '';
  stderrData = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
    stdoutData += String(data);
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((data) => {
    stderrData += String(data);
    return true;
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fleetCommand', () => {
  it('returns 1 for unknown action', async () => {
    const code = await fleetCommand(mockClient(), args('unknown'), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('Unknown fleet action');
  });

  it('returns 1 for no action', async () => {
    const code = await fleetCommand(mockClient(), args(undefined), false);
    expect(code).toBe(1);
  });
});

describe('fleet status', () => {
  it('shows fleet overview', async () => {
    const client = mockClient();
    const code = await fleetCommand(client, args('status'), false);
    expect(code).toBe(0);
    expect(client.fleet.overview).toHaveBeenCalled();
    expect(stdoutData).toContain('totalWorkers');
  });

  it('returns 1 on API error', async () => {
    const client = mockClient({
      overview: vi
        .fn()
        .mockReturnValue(
          errAsync(new PawsApiError(500, { error: { code: 'INTERNAL_ERROR', message: 'down' } })),
        ),
    });
    const code = await fleetCommand(client, args('status'), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('down');
  });

  it('outputs pretty format when requested', async () => {
    const client = mockClient();
    const code = await fleetCommand(client, args('status'), true);
    expect(code).toBe(0);
    // Pretty format uses key-value padding, not JSON
    expect(stdoutData).toContain('totalWorkers');
    expect(stdoutData).not.toContain('{');
  });
});

describe('fleet workers', () => {
  it('lists workers', async () => {
    const client = mockClient();
    const code = await fleetCommand(client, args('workers'), false);
    expect(code).toBe(0);
    expect(client.fleet.workers).toHaveBeenCalled();
    expect(stdoutData).toContain('worker-1');
  });

  it('returns 1 on API error', async () => {
    const client = mockClient({
      workers: vi
        .fn()
        .mockReturnValue(
          errAsync(
            new PawsApiError(503, { error: { code: 'INTERNAL_ERROR', message: 'unavailable' } }),
          ),
        ),
    });
    const code = await fleetCommand(client, args('workers'), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('unavailable');
  });
});
