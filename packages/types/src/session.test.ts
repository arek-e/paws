import { describe, expect, test } from 'vitest';

import {
  CancelSessionResponseSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  ResourcesSchema,
  SessionSchema,
  SessionStatus,
  WorkloadSchema,
} from './session.js';

describe('SessionStatus', () => {
  test('accepts all valid statuses', () => {
    const statuses = ['pending', 'running', 'completed', 'failed', 'timeout', 'cancelled'] as const;
    for (const s of statuses) {
      expect(SessionStatus.parse(s)).toBe(s);
    }
  });

  test('rejects invalid status', () => {
    expect(() => SessionStatus.parse('unknown')).toThrow();
  });
});

describe('ResourcesSchema', () => {
  test('accepts valid resources', () => {
    const result = ResourcesSchema.parse({ vcpus: 4, memoryMB: 8192 });
    expect(result.vcpus).toBe(4);
    expect(result.memoryMB).toBe(8192);
  });

  test('applies defaults', () => {
    const result = ResourcesSchema.parse({});
    expect(result.vcpus).toBe(2);
    expect(result.memoryMB).toBe(4096);
  });

  test('rejects vcpus > 8', () => {
    expect(() => ResourcesSchema.parse({ vcpus: 16 })).toThrow();
  });

  test('rejects vcpus < 1', () => {
    expect(() => ResourcesSchema.parse({ vcpus: 0 })).toThrow();
  });

  test('rejects memoryMB > 16384', () => {
    expect(() => ResourcesSchema.parse({ memoryMB: 32768 })).toThrow();
  });

  test('rejects memoryMB < 256', () => {
    expect(() => ResourcesSchema.parse({ memoryMB: 128 })).toThrow();
  });
});

describe('WorkloadSchema', () => {
  test('accepts valid script workload', () => {
    const result = WorkloadSchema.parse({
      type: 'script',
      script: 'echo hello',
    });
    expect(result.type).toBe('script');
    expect(result.script).toBe('echo hello');
    expect(result.env).toEqual({});
  });

  test('accepts workload with env', () => {
    const result = WorkloadSchema.parse({
      type: 'script',
      script: 'echo $MY_VAR',
      env: { MY_VAR: 'value' },
    });
    expect(result.env['MY_VAR']).toBe('value');
  });

  test('rejects empty script', () => {
    expect(() => WorkloadSchema.parse({ type: 'script', script: '' })).toThrow();
  });

  test('rejects unknown workload type', () => {
    expect(() => WorkloadSchema.parse({ type: 'docker', script: 'echo' })).toThrow();
  });
});

describe('CreateSessionRequestSchema', () => {
  const validRequest = {
    snapshot: 'claude-agent',
    workload: { type: 'script', script: 'echo hello' },
  };

  test('accepts minimal request', () => {
    const result = CreateSessionRequestSchema.parse(validRequest);
    expect(result.snapshot).toBe('claude-agent');
    expect(result.timeoutMs).toBe(600_000);
  });

  test('accepts full request', () => {
    const result = CreateSessionRequestSchema.parse({
      ...validRequest,
      resources: { vcpus: 4, memoryMB: 8192 },
      timeoutMs: 300_000,
      network: {
        allowOut: ['api.anthropic.com'],
        credentials: {
          'api.anthropic.com': { headers: { 'x-api-key': 'sk-ant-123' } },
        },
      },
      callbackUrl: 'https://example.com/callback',
      metadata: { issueId: '123' },
    });
    expect(result.resources?.vcpus).toBe(4);
    expect(result.callbackUrl).toBe('https://example.com/callback');
  });

  test('rejects missing snapshot', () => {
    expect(() =>
      CreateSessionRequestSchema.parse({
        workload: { type: 'script', script: 'echo' },
      }),
    ).toThrow();
  });

  test('rejects invalid callbackUrl', () => {
    expect(() =>
      CreateSessionRequestSchema.parse({
        ...validRequest,
        callbackUrl: 'not-a-url',
      }),
    ).toThrow();
  });
});

describe('CreateSessionResponseSchema', () => {
  test('accepts valid response', () => {
    const result = CreateSessionResponseSchema.parse({
      sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      status: 'pending',
    });
    expect(result.status).toBe('pending');
  });
});

describe('SessionSchema', () => {
  test('accepts completed session', () => {
    const result = SessionSchema.parse({
      sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      status: 'completed',
      exitCode: 0,
      stdout: 'hello\n',
      stderr: '',
      startedAt: '2026-03-26T10:00:00Z',
      completedAt: '2026-03-26T10:00:05Z',
      durationMs: 5000,
      worker: 'worker-node-1',
      metadata: { issueId: '123' },
    });
    expect(result.exitCode).toBe(0);
  });

  test('accepts pending session (minimal fields)', () => {
    const result = SessionSchema.parse({
      sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      status: 'pending',
    });
    expect(result.exitCode).toBeUndefined();
  });
});

describe('CancelSessionResponseSchema', () => {
  test('accepts valid cancel response', () => {
    const result = CancelSessionResponseSchema.parse({
      sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      status: 'cancelled',
    });
    expect(result.status).toBe('cancelled');
  });
});
