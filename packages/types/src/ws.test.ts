import { describe, expect, test } from 'vitest';

import {
  WsStatusMessage,
  WsCompleteMessage,
  WsErrorMessage,
  WsOutputMessage,
  WsSessionMessage,
} from './ws.js';

describe('WsStatusMessage', () => {
  test('accepts valid status message', () => {
    const msg = {
      type: 'status',
      sessionId: 'abc-123',
      status: 'running',
    };
    expect(WsStatusMessage.parse(msg)).toEqual(msg);
  });

  test('accepts optional fields', () => {
    const msg = {
      type: 'status',
      sessionId: 'abc-123',
      status: 'running',
      startedAt: '2026-01-01T00:00:00Z',
      worker: 'http://worker-1:3000',
    };
    const parsed = WsStatusMessage.parse(msg);
    expect(parsed.startedAt).toBe('2026-01-01T00:00:00Z');
    expect(parsed.worker).toBe('http://worker-1:3000');
  });

  test('rejects wrong type literal', () => {
    expect(() =>
      WsStatusMessage.parse({ type: 'complete', sessionId: 'abc', status: 'running' }),
    ).toThrow();
  });

  test('rejects invalid session status', () => {
    expect(() =>
      WsStatusMessage.parse({ type: 'status', sessionId: 'abc', status: 'invalid' }),
    ).toThrow();
  });

  test('rejects missing sessionId', () => {
    expect(() => WsStatusMessage.parse({ type: 'status', status: 'running' })).toThrow();
  });

  test('accepts all valid session statuses', () => {
    for (const status of ['pending', 'running', 'completed', 'failed', 'timeout', 'cancelled']) {
      expect(WsStatusMessage.parse({ type: 'status', sessionId: 'x', status })).toHaveProperty(
        'status',
        status,
      );
    }
  });
});

describe('WsCompleteMessage', () => {
  test('accepts minimal complete message', () => {
    const msg = { type: 'complete', sessionId: 'abc-123', status: 'completed' };
    expect(WsCompleteMessage.parse(msg)).toEqual(msg);
  });

  test('accepts optional exitCode, durationMs, output', () => {
    const msg = {
      type: 'complete',
      sessionId: 'abc-123',
      status: 'completed',
      exitCode: 0,
      durationMs: 5000,
      output: { result: 'ok' },
    };
    const parsed = WsCompleteMessage.parse(msg);
    expect(parsed.exitCode).toBe(0);
    expect(parsed.durationMs).toBe(5000);
    expect(parsed.output).toEqual({ result: 'ok' });
  });

  test('rejects missing status', () => {
    expect(() => WsCompleteMessage.parse({ type: 'complete', sessionId: 'abc' })).toThrow();
  });
});

describe('WsErrorMessage', () => {
  test('accepts valid error message', () => {
    const msg = { type: 'error', message: 'something went wrong' };
    expect(WsErrorMessage.parse(msg)).toEqual(msg);
  });

  test('rejects missing message', () => {
    expect(() => WsErrorMessage.parse({ type: 'error' })).toThrow();
  });

  test('rejects non-string message', () => {
    expect(() => WsErrorMessage.parse({ type: 'error', message: 42 })).toThrow();
  });
});

describe('WsOutputMessage', () => {
  test('accepts stdout output message', () => {
    const msg = { type: 'output', stream: 'stdout', data: 'hello world' };
    expect(WsOutputMessage.parse(msg)).toEqual(msg);
  });

  test('accepts stderr output message', () => {
    const msg = { type: 'output', stream: 'stderr', data: 'error!' };
    expect(WsOutputMessage.parse(msg)).toEqual(msg);
  });

  test('rejects invalid stream value', () => {
    expect(() =>
      WsOutputMessage.parse({ type: 'output', stream: 'stdlog', data: 'nope' }),
    ).toThrow();
  });

  test('rejects missing data', () => {
    expect(() => WsOutputMessage.parse({ type: 'output', stream: 'stdout' })).toThrow();
  });
});

describe('WsSessionMessage (discriminated union)', () => {
  test('parses status message', () => {
    const msg = WsSessionMessage.parse({
      type: 'status',
      sessionId: 'abc',
      status: 'pending',
    });
    expect(msg.type).toBe('status');
  });

  test('parses complete message', () => {
    const msg = WsSessionMessage.parse({
      type: 'complete',
      sessionId: 'abc',
      status: 'completed',
    });
    expect(msg.type).toBe('complete');
  });

  test('parses error message', () => {
    const msg = WsSessionMessage.parse({ type: 'error', message: 'oops' });
    expect(msg.type).toBe('error');
  });

  test('parses output message', () => {
    const msg = WsSessionMessage.parse({
      type: 'output',
      stream: 'stdout',
      data: 'line1',
    });
    expect(msg.type).toBe('output');
  });

  test('rejects unknown type', () => {
    expect(() => WsSessionMessage.parse({ type: 'unknown', data: 'nope' })).toThrow();
  });

  test('rejects empty object', () => {
    expect(() => WsSessionMessage.parse({})).toThrow();
  });
});
