import { describe, expect, test } from 'vitest';

import { ControlPlaneError, controlPlaneError } from './errors.js';

describe('ControlPlaneError', () => {
  test('has correct properties', () => {
    const err = new ControlPlaneError('NOT_FOUND', 'Session not found', 404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Session not found');
    expect(err.httpStatus).toBe(404);
    expect(err.name).toBe('ControlPlaneError');
    expect(err).toBeInstanceOf(Error);
  });

  test('includes cause when provided', () => {
    const cause = new Error('original');
    const err = new ControlPlaneError('INTERNAL_ERROR', 'wrapped', 500, cause);
    expect(err.cause).toBe(cause);
  });
});

describe('controlPlaneError', () => {
  test('maps UNAUTHORIZED to 401', () => {
    const err = controlPlaneError('UNAUTHORIZED', 'No token');
    expect(err.httpStatus).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  test('maps SESSION_NOT_FOUND to 404', () => {
    const err = controlPlaneError('SESSION_NOT_FOUND', 'gone');
    expect(err.httpStatus).toBe(404);
  });

  test('maps DAEMON_ALREADY_EXISTS to 409', () => {
    const err = controlPlaneError('DAEMON_ALREADY_EXISTS', 'dup');
    expect(err.httpStatus).toBe(409);
  });

  test('maps RATE_LIMITED to 429', () => {
    const err = controlPlaneError('RATE_LIMITED', 'slow down');
    expect(err.httpStatus).toBe(429);
  });

  test('maps CAPACITY_EXHAUSTED to 503', () => {
    const err = controlPlaneError('CAPACITY_EXHAUSTED', 'full');
    expect(err.httpStatus).toBe(503);
  });

  test('maps VALIDATION_ERROR to 400', () => {
    const err = controlPlaneError('VALIDATION_ERROR', 'bad input');
    expect(err.httpStatus).toBe(400);
  });
});
