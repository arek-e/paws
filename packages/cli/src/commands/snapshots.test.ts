import { describe, it, expect, vi, beforeEach } from 'vitest';
import { okAsync, errAsync } from 'neverthrow';

import { snapshotsCommand } from './snapshots.js';
import type { PawsClient } from '@paws/sdk';
import { PawsApiError } from '@paws/sdk';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockClient(overrides: Partial<PawsClient['snapshots']> = {}): PawsClient {
  return {
    sessions: {} as PawsClient['sessions'],
    daemons: {} as PawsClient['daemons'],
    fleet: {} as PawsClient['fleet'],
    snapshots: {
      list: vi.fn().mockReturnValue(
        okAsync({
          snapshots: [{ id: 'agent-latest', version: 1, status: 'ready' }],
        }),
      ),
      build: vi.fn().mockReturnValue(okAsync({ buildId: 'build-1', status: 'queued' })),
      ...overrides,
    },
    webhooks: {} as PawsClient['webhooks'],
  } as PawsClient;
}

function args(action?: string, positional?: string, flags: Record<string, string> = {}) {
  return { resource: 'snapshots', action, positional, flags };
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

describe('snapshotsCommand', () => {
  it('returns 1 for unknown action', async () => {
    const code = await snapshotsCommand(mockClient(), args('unknown'), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('Unknown snapshots action');
  });

  it('returns 1 for no action', async () => {
    const code = await snapshotsCommand(mockClient(), args(undefined), false);
    expect(code).toBe(1);
  });
});

describe('snapshots list', () => {
  it('lists snapshots', async () => {
    const client = mockClient();
    const code = await snapshotsCommand(client, args('list'), false);
    expect(code).toBe(0);
    expect(client.snapshots.list).toHaveBeenCalled();
    expect(stdoutData).toContain('agent-latest');
  });

  it('returns 1 on API error', async () => {
    const client = mockClient({
      list: vi
        .fn()
        .mockReturnValue(
          errAsync(new PawsApiError(500, { error: { code: 'INTERNAL_ERROR', message: 'oops' } })),
        ),
    });
    const code = await snapshotsCommand(client, args('list'), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('oops');
  });
});

describe('snapshots build', () => {
  it('builds a snapshot with required flags', async () => {
    const client = mockClient();
    const code = await snapshotsCommand(
      client,
      args('build', 'my-snap', { base: 'ubuntu', setup: 'apt install curl' }),
      false,
    );
    expect(code).toBe(0);
    expect(client.snapshots.build).toHaveBeenCalledWith('my-snap', {
      base: 'ubuntu',
      setup: 'apt install curl',
    });
    expect(stdoutData).toContain('build-1');
  });

  it('returns 1 when snapshot ID is missing', async () => {
    const code = await snapshotsCommand(
      mockClient(),
      args('build', undefined, { base: 'ubuntu', setup: 'x' }),
      false,
    );
    expect(code).toBe(1);
    expect(stderrData).toContain('Snapshot ID is required');
  });

  it('returns 1 when --base is missing', async () => {
    const code = await snapshotsCommand(mockClient(), args('build', 'snap', { setup: 'x' }), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('--base is required');
  });

  it('returns 1 when --setup is missing', async () => {
    const code = await snapshotsCommand(
      mockClient(),
      args('build', 'snap', { base: 'ubuntu' }),
      false,
    );
    expect(code).toBe(1);
    expect(stderrData).toContain('--setup is required');
  });

  it('returns 1 on API error', async () => {
    const client = mockClient({
      build: vi
        .fn()
        .mockReturnValue(
          errAsync(
            new PawsApiError(404, { error: { code: 'SNAPSHOT_NOT_FOUND', message: 'not found' } }),
          ),
        ),
    });
    const code = await snapshotsCommand(
      client,
      args('build', 'snap', { base: 'ubuntu', setup: 'x' }),
      false,
    );
    expect(code).toBe(1);
    expect(stderrData).toContain('not found');
  });
});
