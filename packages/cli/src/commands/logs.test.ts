import { describe, it, expect, vi, beforeEach } from 'vitest';
import { okAsync, errAsync } from 'neverthrow';

import { logsCommand } from './logs.js';
import type { PawsClient } from '@paws/sdk';
import { PawsApiError } from '@paws/sdk';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockClient(overrides: Partial<PawsClient['sessions']> = {}): PawsClient {
  return {
    sessions: {
      create: vi.fn().mockReturnValue(okAsync({ sessionId: 'ses_abc123', status: 'pending' })),
      get: vi.fn().mockReturnValue(
        okAsync({
          sessionId: 'ses_abc123',
          status: 'completed',
          exitCode: 0,
          stdout: 'output line 1\noutput line 2\n',
          stderr: 'warning: something\n',
        }),
      ),
      cancel: vi.fn(),
      waitForCompletion: vi.fn(),
      list: vi.fn(),
      ...overrides,
    },
    daemons: {} as PawsClient['daemons'],
    fleet: {} as PawsClient['fleet'],
    snapshots: {} as PawsClient['snapshots'],
    webhooks: {} as PawsClient['webhooks'],
  } as PawsClient;
}

function args(
  action?: string,
  flags: Record<string, string> = {},
  multiFlags: Record<string, string[]> = {},
) {
  return { resource: 'logs', action, positional: undefined, flags, multiFlags };
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

describe('logs command', () => {
  it('shows help when --help is passed', async () => {
    const code = await logsCommand(mockClient(), args(undefined, { help: 'true' }), false);
    expect(code).toBe(0);
    expect(stdoutData).toContain('Usage: paws logs');
  });

  it('returns 1 when session ID is missing', async () => {
    const code = await logsCommand(mockClient(), args(undefined), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('Session ID is required');
  });

  it('fetches and prints stdout', async () => {
    const code = await logsCommand(mockClient(), args('ses_abc123'), false);
    expect(code).toBe(0);
    expect(stdoutData).toContain('output line 1');
    expect(stdoutData).toContain('output line 2');
  });

  it('prints stderr to stderr', async () => {
    const code = await logsCommand(mockClient(), args('ses_abc123'), false);
    expect(code).toBe(0);
    expect(stderrData).toContain('warning: something');
  });

  it('shows (no output) when both stdout and stderr are empty', async () => {
    const client = mockClient({
      get: vi.fn().mockReturnValue(
        okAsync({
          sessionId: 'ses_abc123',
          status: 'completed',
          stdout: '',
          stderr: '',
        }),
      ),
    });
    const code = await logsCommand(client, args('ses_abc123'), false);
    expect(code).toBe(0);
    expect(stderrData).toContain('(no output)');
  });

  it('returns 1 on API error', async () => {
    const client = mockClient({
      get: vi
        .fn()
        .mockReturnValue(
          errAsync(
            new PawsApiError(404, { error: { code: 'NOT_FOUND', message: 'session not found' } }),
          ),
        ),
    });
    const code = await logsCommand(client, args('ses_bad'), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('session not found');
  });

  it('follows logs until terminal status', async () => {
    let callCount = 0;
    const client = mockClient({
      get: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return okAsync({
            sessionId: 'ses_abc123',
            status: 'running',
            stdout: 'line 1\n',
            stderr: '',
          });
        }
        return okAsync({
          sessionId: 'ses_abc123',
          status: 'completed',
          exitCode: 0,
          stdout: 'line 1\nline 2\n',
          stderr: '',
        });
      }),
    });

    const code = await logsCommand(
      client,
      args('ses_abc123', { follow: 'true', interval: '10' }),
      false,
    );
    expect(code).toBe(0);
    expect(stdoutData).toBe('line 1\nline 2\n');
    expect(client.sessions.get).toHaveBeenCalledTimes(2);
  });

  it('returns session exit code in follow mode', async () => {
    const client = mockClient({
      get: vi.fn().mockReturnValue(
        okAsync({
          sessionId: 'ses_abc123',
          status: 'failed',
          exitCode: 1,
          stdout: 'error output\n',
          stderr: '',
        }),
      ),
    });

    const code = await logsCommand(
      client,
      args('ses_abc123', { follow: 'true', interval: '10' }),
      false,
    );
    expect(code).toBe(1);
  });
});
