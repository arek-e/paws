import { describe, expect, test } from 'vitest';

import { CreateSessionRequestSchema } from './types.js';

describe('CreateSessionRequestSchema', () => {
  const validInput = {
    snapshot: 'agent-latest',
    workload: {
      type: 'script' as const,
      script: 'echo hello',
    },
  };

  test('accepts valid minimal input', () => {
    const result = CreateSessionRequestSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.snapshot).toBe('agent-latest');
      expect(result.data.workload.script).toBe('echo hello');
      // defaults applied
      expect(result.data.timeoutMs).toBe(600_000);
    }
  });

  test('accepts input with all optional fields', () => {
    const full = {
      ...validInput,
      resources: { vcpus: 4, memoryMB: 8192 },
      timeoutMs: 300_000,
      callbackUrl: 'https://example.com/callback',
      metadata: { team: 'platform' },
    };
    const result = CreateSessionRequestSchema.safeParse(full);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resources?.vcpus).toBe(4);
      expect(result.data.timeoutMs).toBe(300_000);
    }
  });

  test('rejects missing snapshot', () => {
    const result = CreateSessionRequestSchema.safeParse({
      workload: { type: 'script', script: 'echo hi' },
    });
    expect(result.success).toBe(false);
  });

  test('rejects missing workload', () => {
    const result = CreateSessionRequestSchema.safeParse({
      snapshot: 'test',
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty snapshot string', () => {
    const result = CreateSessionRequestSchema.safeParse({
      snapshot: '',
      workload: { type: 'script', script: 'echo hi' },
    });
    expect(result.success).toBe(false);
  });

  test('rejects vcpus above max (8)', () => {
    const result = CreateSessionRequestSchema.safeParse({
      ...validInput,
      resources: { vcpus: 16, memoryMB: 4096 },
    });
    expect(result.success).toBe(false);
  });

  test('rejects vcpus below min (1)', () => {
    const result = CreateSessionRequestSchema.safeParse({
      ...validInput,
      resources: { vcpus: 0, memoryMB: 4096 },
    });
    expect(result.success).toBe(false);
  });

  test('applies default resources when omitted', () => {
    const result = CreateSessionRequestSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resources).toBeUndefined();
    }
  });

  test('applies default env when omitted from workload', () => {
    const result = CreateSessionRequestSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workload.env).toEqual({});
    }
  });
});
