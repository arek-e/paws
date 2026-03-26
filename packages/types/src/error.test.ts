import { describe, expect, test } from 'vitest';

import { ErrorCode, ErrorResponseSchema } from './error.js';

describe('ErrorCode', () => {
  test('accepts all defined error codes', () => {
    const codes = [
      'UNAUTHORIZED',
      'FORBIDDEN',
      'SESSION_NOT_FOUND',
      'DAEMON_NOT_FOUND',
      'DAEMON_ALREADY_EXISTS',
      'SNAPSHOT_NOT_FOUND',
      'WORKER_NOT_FOUND',
      'CAPACITY_EXHAUSTED',
      'RATE_LIMITED',
      'VALIDATION_ERROR',
      'INTERNAL_ERROR',
    ] as const;

    for (const code of codes) {
      expect(ErrorCode.parse(code)).toBe(code);
    }
  });

  test('rejects unknown error codes', () => {
    expect(() => ErrorCode.parse('UNKNOWN_CODE')).toThrow();
  });
});

describe('ErrorResponseSchema', () => {
  test('accepts valid error response', () => {
    const result = ErrorResponseSchema.parse({
      error: {
        code: 'SESSION_NOT_FOUND',
        message: 'Session a1b2c3d4 not found',
      },
    });
    expect(result.error.code).toBe('SESSION_NOT_FOUND');
    expect(result.error.message).toBe('Session a1b2c3d4 not found');
  });

  test('rejects missing code', () => {
    expect(() =>
      ErrorResponseSchema.parse({
        error: { message: 'oops' },
      }),
    ).toThrow();
  });

  test('rejects missing message', () => {
    expect(() =>
      ErrorResponseSchema.parse({
        error: { code: 'INTERNAL_ERROR' },
      }),
    ).toThrow();
  });
});
