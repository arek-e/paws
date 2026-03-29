import { describe, it, expect } from 'vitest';

import { PawsApiError, PawsNetworkError } from './errors.js';

describe('PawsApiError', () => {
  it('sets name to PawsApiError', () => {
    const err = new PawsApiError(404, {
      error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
    });
    expect(err.name).toBe('PawsApiError');
  });

  it('sets message from error body', () => {
    const err = new PawsApiError(404, {
      error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
    });
    expect(err.message).toBe('Session not found');
  });

  it('sets status code', () => {
    const err = new PawsApiError(403, {
      error: { code: 'FORBIDDEN', message: 'Access denied' },
    });
    expect(err.status).toBe(403);
  });

  it('sets error code', () => {
    const err = new PawsApiError(429, {
      error: { code: 'RATE_LIMITED', message: 'Too many requests' },
    });
    expect(err.code).toBe('RATE_LIMITED');
  });

  it('is an instance of Error', () => {
    const err = new PawsApiError(500, {
      error: { code: 'INTERNAL_ERROR', message: 'oops' },
    });
    expect(err).toBeInstanceOf(Error);
  });

  it('preserves all error codes', () => {
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
      const err = new PawsApiError(400, { error: { code, message: 'test' } });
      expect(err.code).toBe(code);
    }
  });
});

describe('PawsNetworkError', () => {
  it('sets name to PawsNetworkError', () => {
    const err = new PawsNetworkError('Connection refused');
    expect(err.name).toBe('PawsNetworkError');
  });

  it('sets message', () => {
    const err = new PawsNetworkError('DNS lookup failed');
    expect(err.message).toBe('DNS lookup failed');
  });

  it('sets cause when provided', () => {
    const original = new TypeError('fetch failed');
    const err = new PawsNetworkError('Network error', original);
    expect(err.cause).toBe(original);
  });

  it('cause is undefined when not provided', () => {
    const err = new PawsNetworkError('timeout');
    expect(err.cause).toBeUndefined();
  });

  it('is an instance of Error', () => {
    const err = new PawsNetworkError('network issue');
    expect(err).toBeInstanceOf(Error);
  });

  it('works with non-Error cause', () => {
    const err = new PawsNetworkError('failed', 'string cause');
    expect(err.cause).toBe('string cause');
  });
});
