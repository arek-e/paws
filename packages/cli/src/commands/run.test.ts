import { describe, it, expect, vi, beforeEach } from 'vitest';
import { okAsync, errAsync } from 'neverthrow';

import { runCommand } from './run.js';
import type { PawsClient } from '@paws/sdk';
import { PawsApiError } from '@paws/sdk';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockClient(
  overrides: Partial<PawsClient['sessions']> = {},
  sessionData: Record<string, unknown> = {},
): PawsClient {
  const defaultSession = {
    sessionId: 'ses_abc123',
    status: 'completed',
    exitCode: 0,
    stdout: 'hello world\n',
    stderr: '',
    durationMs: 5000,
    ...sessionData,
  };

  return {
    sessions: {
      create: vi.fn().mockReturnValue(okAsync({ sessionId: 'ses_abc123', status: 'pending' })),
      get: vi.fn().mockReturnValue(okAsync(defaultSession)),
      cancel: vi.fn().mockReturnValue(okAsync({ sessionId: 'ses_abc123', status: 'cancelled' })),
      waitForCompletion: vi.fn().mockReturnValue(okAsync(defaultSession)),
      list: vi.fn().mockReturnValue(okAsync({ sessions: [] })),
      ...overrides,
    },
    daemons: {} as PawsClient['daemons'],
    fleet: {} as PawsClient['fleet'],
    snapshots: {} as PawsClient['snapshots'],
    webhooks: {} as PawsClient['webhooks'],
  } as PawsClient;
}

function args(flags: Record<string, string> = {}, multiFlags: Record<string, string[]> = {}) {
  return { resource: 'run', action: undefined, positional: undefined, flags, multiFlags };
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
  // Mock isTTY to false for predictable output in tests
  Object.defineProperty(process.stderr, 'isTTY', { value: false, configurable: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('run command', () => {
  it('shows help when --help is passed', async () => {
    const code = await runCommand(mockClient(), args({ help: 'true' }), false);
    expect(code).toBe(0);
    expect(stdoutData).toContain('Usage: paws run');
  });

  it('returns 1 when --snapshot is missing', async () => {
    const code = await runCommand(mockClient(), args({ prompt: 'do something' }), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('--snapshot is required');
  });

  it('returns 1 when neither --prompt nor --script is provided', async () => {
    const code = await runCommand(mockClient(), args({ snapshot: 'test' }), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('Either --prompt or --script is required');
  });

  it('creates a session with prompt and polls to completion', async () => {
    const client = mockClient();
    const code = await runCommand(
      client,
      args({ snapshot: 'agent-latest', prompt: 'Review this PR' }),
      false,
    );
    expect(code).toBe(0);
    expect(client.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: 'agent-latest',
        workload: { type: 'script', script: 'Review this PR' },
      }),
    );
    expect(stdoutData).toContain('ses_abc123');
  });

  it('passes env vars from multiFlags', async () => {
    const client = mockClient();
    await runCommand(
      client,
      args(
        { snapshot: 'test', prompt: 'deploy', env: 'DRY_RUN=true' },
        { env: ['BRANCH=main', 'DRY_RUN=true'] },
      ),
      false,
    );
    expect(client.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workload: expect.objectContaining({
          env: { BRANCH: 'main', DRY_RUN: 'true' },
        }),
      }),
    );
  });

  it('returns 1 for invalid --env format', async () => {
    const code = await runCommand(
      mockClient(),
      args({ snapshot: 'test', prompt: 'deploy', env: 'INVALID' }, { env: ['INVALID'] }),
      false,
    );
    expect(code).toBe(1);
    expect(stderrData).toContain('Invalid --env format');
  });

  it('passes resources when --vcpus and --memory are set', async () => {
    const client = mockClient();
    await runCommand(
      client,
      args({ snapshot: 'test', prompt: 'build', vcpus: '4', memory: '8192' }),
      false,
    );
    expect(client.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: { vcpus: 4, memoryMB: 8192 },
      }),
    );
  });

  it('passes timeout when --timeout is set', async () => {
    const client = mockClient();
    await runCommand(client, args({ snapshot: 'test', prompt: 'audit', timeout: '300000' }), false);
    expect(client.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 300000 }),
    );
  });

  it('prints session ID and exits with --no-wait', async () => {
    const client = mockClient();
    const code = await runCommand(
      client,
      args({ snapshot: 'test', prompt: 'review', 'no-wait': 'true' }),
      false,
    );
    expect(code).toBe(0);
    expect(stdoutData).toContain('ses_abc123');
    expect(stdoutData).toContain('pending');
    // Should not have polled
    expect(client.sessions.get).not.toHaveBeenCalled();
  });

  it('returns session exit code on completion', async () => {
    const client = mockClient({}, { exitCode: 42, status: 'failed' });
    const code = await runCommand(client, args({ snapshot: 'test', prompt: 'fail' }), false);
    expect(code).toBe(42);
  });

  it('returns 1 for failed sessions with no exit code', async () => {
    const client = mockClient({}, { exitCode: undefined, status: 'failed' });
    const code = await runCommand(client, args({ snapshot: 'test', prompt: 'fail' }), false);
    expect(code).toBe(1);
  });

  it('returns 1 when session create fails', async () => {
    const client = mockClient({
      create: vi
        .fn()
        .mockReturnValue(
          errAsync(
            new PawsApiError(400, { error: { code: 'VALIDATION_ERROR', message: 'bad snapshot' } }),
          ),
        ),
    });
    const code = await runCommand(client, args({ snapshot: 'bad', prompt: 'test' }), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('bad snapshot');
  });

  it('returns 1 when polling fails', async () => {
    const client = mockClient({
      get: vi
        .fn()
        .mockReturnValue(
          errAsync(
            new PawsApiError(404, { error: { code: 'NOT_FOUND', message: 'session not found' } }),
          ),
        ),
    });
    const code = await runCommand(client, args({ snapshot: 'test', prompt: 'test' }), false);
    expect(code).toBe(1);
    expect(stderrData).toContain('session not found');
  });
});
