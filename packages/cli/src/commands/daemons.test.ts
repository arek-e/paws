import { describe, it, expect, vi, beforeEach } from 'vitest';
import { okAsync, errAsync } from 'neverthrow';

import { daemonsCommand } from './daemons.js';
import type { PawsClient } from '@paws/sdk';
import { PawsApiError } from '@paws/sdk';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockClient(overrides: Partial<PawsClient['daemons']> = {}): PawsClient {
  return {
    sessions: {} as PawsClient['sessions'],
    daemons: {
      list: vi.fn().mockReturnValue(okAsync({ daemons: [{ role: 'reviewer' }] })),
      create: vi.fn().mockReturnValue(okAsync({ role: 'reviewer', status: 'active' })),
      get: vi.fn().mockReturnValue(okAsync({ role: 'reviewer', status: 'active' })),
      delete: vi.fn().mockReturnValue(okAsync({ role: 'reviewer', status: 'stopped' })),
      update: vi.fn().mockReturnValue(okAsync({ role: 'reviewer' })),
      ...overrides,
    },
    fleet: {} as PawsClient['fleet'],
    snapshots: {} as PawsClient['snapshots'],
    webhooks: {} as PawsClient['webhooks'],
  } as PawsClient;
}

function args(action?: string, positional?: string, flags: Record<string, string> = {}) {
  return { resource: 'daemons', action, positional, flags };
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

describe('daemonsCommand', () => {
  it('returns 1 for unknown action', async () => {
    const code = await daemonsCommand(mockClient(), args('unknown'), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('Unknown daemons action');
  });

  it('returns 1 for no action', async () => {
    const code = await daemonsCommand(mockClient(), args(undefined), false);
    expect(code).toBe(1);
  });
});

describe('daemons list', () => {
  it('lists daemons', async () => {
    const client = mockClient();
    const code = await daemonsCommand(client, args('list'), false);
    expect(code).toBe(0);
    expect(client.daemons.list).toHaveBeenCalled();
    expect(stdoutData).toContain('reviewer');
  });

  it('returns 1 on API error', async () => {
    const client = mockClient({
      list: vi
        .fn()
        .mockReturnValue(
          errAsync(new PawsApiError(500, { error: { code: 'INTERNAL_ERROR', message: 'fail' } })),
        ),
    });
    const code = await daemonsCommand(client, args('list'), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('fail');
  });
});

describe('daemons create', () => {
  it('creates a webhook daemon with required flags', async () => {
    const client = mockClient();
    const code = await daemonsCommand(
      client,
      args('create', undefined, {
        role: 'reviewer',
        snapshot: 'test',
        'trigger-type': 'webhook',
        events: 'push,pull_request',
        script: 'echo hi',
      }),
      false,
    );
    expect(code).toBe(0);
    expect(client.daemons.create).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'reviewer',
        snapshot: 'test',
        trigger: { type: 'webhook', events: ['push', 'pull_request'] },
        workload: { type: 'script', script: 'echo hi' },
      }),
    );
  });

  it('creates a schedule daemon', async () => {
    const client = mockClient();
    await daemonsCommand(
      client,
      args('create', undefined, {
        role: 'cron-bot',
        snapshot: 'test',
        'trigger-type': 'schedule',
        cron: '0 * * * *',
        script: 'echo tick',
      }),
      false,
    );
    expect(client.daemons.create).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: { type: 'schedule', cron: '0 * * * *' },
      }),
    );
  });

  it('creates a watch daemon', async () => {
    const client = mockClient();
    await daemonsCommand(
      client,
      args('create', undefined, {
        role: 'watcher',
        snapshot: 'test',
        'trigger-type': 'watch',
        condition: 'cpu > 90',
        script: 'echo alert',
      }),
      false,
    );
    expect(client.daemons.create).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: { type: 'watch', condition: 'cpu > 90' },
      }),
    );
  });

  it('returns 1 when --role is missing', async () => {
    const code = await daemonsCommand(
      mockClient(),
      args('create', undefined, {
        snapshot: 'test',
        'trigger-type': 'webhook',
        events: 'push',
        script: 'x',
      }),
      false,
    );
    expect(code).toBe(1);
    expect(stderrData).toContain('--role is required');
  });

  it('returns 1 when --snapshot is missing', async () => {
    const code = await daemonsCommand(
      mockClient(),
      args('create', undefined, {
        role: 'r',
        'trigger-type': 'webhook',
        events: 'push',
        script: 'x',
      }),
      false,
    );
    expect(code).toBe(1);
    expect(stderrData).toContain('--snapshot is required');
  });

  it('returns 1 when --trigger-type is missing', async () => {
    const code = await daemonsCommand(
      mockClient(),
      args('create', undefined, { role: 'r', snapshot: 's', events: 'push', script: 'x' }),
      false,
    );
    expect(code).toBe(1);
    expect(stderrData).toContain('--trigger-type is required');
  });

  it('returns 1 when --script is missing', async () => {
    const code = await daemonsCommand(
      mockClient(),
      args('create', undefined, {
        role: 'r',
        snapshot: 's',
        'trigger-type': 'webhook',
        events: 'push',
      }),
      false,
    );
    expect(code).toBe(1);
    expect(stderrData).toContain('--script is required');
  });

  it('returns 1 for webhook without --events', async () => {
    const code = await daemonsCommand(
      mockClient(),
      args('create', undefined, {
        role: 'r',
        snapshot: 's',
        'trigger-type': 'webhook',
        script: 'x',
      }),
      false,
    );
    expect(code).toBe(1);
    expect(stderrData).toContain('--events is required');
  });

  it('returns 1 for schedule without --cron', async () => {
    const code = await daemonsCommand(
      mockClient(),
      args('create', undefined, {
        role: 'r',
        snapshot: 's',
        'trigger-type': 'schedule',
        script: 'x',
      }),
      false,
    );
    expect(code).toBe(1);
    expect(stderrData).toContain('--cron is required');
  });

  it('returns 1 for watch without --condition', async () => {
    const code = await daemonsCommand(
      mockClient(),
      args('create', undefined, { role: 'r', snapshot: 's', 'trigger-type': 'watch', script: 'x' }),
      false,
    );
    expect(code).toBe(1);
    expect(stderrData).toContain('--condition is required');
  });

  it('returns 1 for unknown trigger type', async () => {
    const code = await daemonsCommand(
      mockClient(),
      args('create', undefined, { role: 'r', snapshot: 's', 'trigger-type': 'magic', script: 'x' }),
      false,
    );
    expect(code).toBe(1);
    expect(stderrData).toContain('Unknown trigger type: magic');
  });
});

describe('daemons get', () => {
  it('gets a daemon by role', async () => {
    const client = mockClient();
    const code = await daemonsCommand(client, args('get', 'reviewer'), false);
    expect(code).toBe(0);
    expect(client.daemons.get).toHaveBeenCalledWith('reviewer');
  });

  it('returns 1 when role is missing', async () => {
    const code = await daemonsCommand(mockClient(), args('get'), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('Daemon role is required');
  });
});

describe('daemons delete', () => {
  it('deletes a daemon by role', async () => {
    const client = mockClient();
    const code = await daemonsCommand(client, args('delete', 'reviewer'), false);
    expect(code).toBe(0);
    expect(client.daemons.delete).toHaveBeenCalledWith('reviewer');
  });

  it('returns 1 when role is missing', async () => {
    const code = await daemonsCommand(mockClient(), args('delete'), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('Daemon role is required');
  });
});
