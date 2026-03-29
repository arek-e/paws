import { describe, it, expect, vi, beforeEach } from 'vitest';
import { okAsync, errAsync } from 'neverthrow';

import { sessionsCommand } from './sessions.js';
import type { PawsClient } from '@paws/sdk';
import { PawsApiError } from '@paws/sdk';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockClient(overrides: Partial<PawsClient['sessions']> = {}): PawsClient {
  return {
    sessions: {
      create: vi.fn().mockReturnValue(okAsync({ sessionId: 'abc-123', status: 'pending' })),
      get: vi.fn().mockReturnValue(okAsync({ sessionId: 'abc-123', status: 'running' })),
      cancel: vi.fn().mockReturnValue(okAsync({ sessionId: 'abc-123', status: 'cancelled' })),
      waitForCompletion: vi
        .fn()
        .mockReturnValue(okAsync({ sessionId: 'abc-123', status: 'completed' })),
      list: vi.fn().mockReturnValue(okAsync({ sessions: [] })),
      ...overrides,
    },
    daemons: {} as PawsClient['daemons'],
    fleet: {} as PawsClient['fleet'],
    snapshots: {} as PawsClient['snapshots'],
    webhooks: {} as PawsClient['webhooks'],
  } as PawsClient;
}

function args(action?: string, positional?: string, flags: Record<string, string> = {}) {
  return { resource: 'sessions', action, positional, flags };
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

describe('sessionsCommand', () => {
  it('returns 1 for unknown action', async () => {
    const code = await sessionsCommand(mockClient(), args('unknown'), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('Unknown sessions action');
  });

  it('returns 1 for no action', async () => {
    const code = await sessionsCommand(mockClient(), args(undefined), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('(none)');
  });
});

describe('sessions create', () => {
  it('creates a session with required flags', async () => {
    const client = mockClient();
    const code = await sessionsCommand(
      client,
      args('create', undefined, { snapshot: 'test', script: 'echo hi' }),
      false,
    );
    expect(code).toBe(0);
    expect(client.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: 'test',
        workload: { type: 'script', script: 'echo hi' },
      }),
    );
    expect(stdoutData).toContain('abc-123');
  });

  it('passes timeout flag', async () => {
    const client = mockClient();
    await sessionsCommand(
      client,
      args('create', undefined, { snapshot: 'test', script: 'echo hi', timeout: '5000' }),
      false,
    );
    expect(client.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 5000 }),
    );
  });

  it('returns 1 when --snapshot is missing', async () => {
    const code = await sessionsCommand(
      mockClient(),
      args('create', undefined, { script: 'echo hi' }),
      false,
    );
    expect(code).toBe(1);
    expect(stderrData).toContain('--snapshot is required');
  });

  it('returns 1 when --script is missing', async () => {
    const code = await sessionsCommand(
      mockClient(),
      args('create', undefined, { snapshot: 'test' }),
      false,
    );
    expect(code).toBe(1);
    expect(stderrData).toContain('--script is required');
  });

  it('returns 1 on API error', async () => {
    const client = mockClient({
      create: vi
        .fn()
        .mockReturnValue(
          errAsync(
            new PawsApiError(400, { error: { code: 'VALIDATION_ERROR', message: 'bad request' } }),
          ),
        ),
    });
    const code = await sessionsCommand(
      client,
      args('create', undefined, { snapshot: 'test', script: 'echo' }),
      false,
    );
    expect(code).toBe(1);
    expect(stderrData).toContain('bad request');
  });
});

describe('sessions get', () => {
  it('gets a session by ID', async () => {
    const client = mockClient();
    const code = await sessionsCommand(client, args('get', 'abc-123'), false);
    expect(code).toBe(0);
    expect(client.sessions.get).toHaveBeenCalledWith('abc-123');
    expect(stdoutData).toContain('abc-123');
  });

  it('returns 1 when ID is missing', async () => {
    const code = await sessionsCommand(mockClient(), args('get'), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('Session ID is required');
  });
});

describe('sessions cancel', () => {
  it('cancels a session by ID', async () => {
    const client = mockClient();
    const code = await sessionsCommand(client, args('cancel', 'abc-123'), false);
    expect(code).toBe(0);
    expect(client.sessions.cancel).toHaveBeenCalledWith('abc-123');
  });

  it('returns 1 when ID is missing', async () => {
    const code = await sessionsCommand(mockClient(), args('cancel'), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('Session ID is required');
  });
});

describe('sessions wait', () => {
  it('waits for session completion', async () => {
    const client = mockClient();
    const code = await sessionsCommand(client, args('wait', 'abc-123'), false);
    expect(code).toBe(0);
    expect(client.sessions.waitForCompletion).toHaveBeenCalledWith('abc-123', {});
  });

  it('passes interval and timeout flags', async () => {
    const client = mockClient();
    await sessionsCommand(
      client,
      args('wait', 'abc-123', { interval: '2000', timeout: '60000' }),
      false,
    );
    expect(client.sessions.waitForCompletion).toHaveBeenCalledWith('abc-123', {
      intervalMs: 2000,
      timeoutMs: 60000,
    });
  });

  it('returns 1 when ID is missing', async () => {
    const code = await sessionsCommand(mockClient(), args('wait'), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('Session ID is required');
  });
});
