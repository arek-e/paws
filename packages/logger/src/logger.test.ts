import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLogger } from './logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collect() {
  const lines: string[] = [];
  const writer = (line: string) => {
    lines.push(line);
  };
  return { lines, writer };
}

function parse(line: string): Record<string, unknown> {
  return JSON.parse(line.trimEnd());
}

// ---------------------------------------------------------------------------
// createLogger — basic output
// ---------------------------------------------------------------------------

describe('createLogger', () => {
  it('outputs valid NDJSON with required fields', () => {
    const { lines, writer } = collect();
    const log = createLogger('test-component', {}, writer);

    log.info('hello world');

    expect(lines).toHaveLength(1);
    const entry = parse(lines[0]!);
    expect(entry).toHaveProperty('ts');
    expect(entry.level).toBe('info');
    expect(entry.component).toBe('test-component');
    expect(entry.msg).toBe('hello world');
  });

  it('includes arbitrary context fields', () => {
    const { lines, writer } = collect();
    const log = createLogger('api', {}, writer);

    log.info('request', { method: 'POST', path: '/sessions', statusCode: 201 });

    const entry = parse(lines[0]!);
    expect(entry.method).toBe('POST');
    expect(entry.path).toBe('/sessions');
    expect(entry.statusCode).toBe(201);
  });

  it('produces a valid ISO 8601 timestamp', () => {
    const { lines, writer } = collect();
    const log = createLogger('ts-check', {}, writer);

    log.info('tick');

    const entry = parse(lines[0]!);
    expect(() => new Date(entry.ts as string)).not.toThrow();
    expect(new Date(entry.ts as string).toISOString()).toBe(entry.ts);
  });

  it('emits all four log levels', () => {
    const { lines, writer } = collect();
    const log = createLogger('levels', {}, writer);

    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');

    // debug is below default "info" level, so only 3 lines
    expect(lines).toHaveLength(3);
    expect(parse(lines[0]!).level).toBe('info');
    expect(parse(lines[1]!).level).toBe('warn');
    expect(parse(lines[2]!).level).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// Log level filtering
// ---------------------------------------------------------------------------

describe('LOG_LEVEL filtering', () => {
  const originalEnv = process.env.LOG_LEVEL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalEnv;
    }
  });

  it('filters below the configured level (warn)', () => {
    process.env.LOG_LEVEL = 'warn';
    const { lines, writer } = collect();
    // createLogger reads LOG_LEVEL at creation time
    const log = createLogger('filter', {}, writer);

    log.debug('nope');
    log.info('nope');
    log.warn('yes');
    log.error('yes');

    expect(lines).toHaveLength(2);
    expect(parse(lines[0]!).level).toBe('warn');
    expect(parse(lines[1]!).level).toBe('error');
  });

  it('shows everything at debug level', () => {
    process.env.LOG_LEVEL = 'debug';
    const { lines, writer } = collect();
    const log = createLogger('verbose', {}, writer);

    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');

    expect(lines).toHaveLength(4);
  });

  it('defaults to info for invalid LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'garbage';
    const { lines, writer } = collect();
    const log = createLogger('fallback', {}, writer);

    log.debug('nope');
    log.info('yes');

    expect(lines).toHaveLength(1);
    expect(parse(lines[0]!).level).toBe('info');
  });
});

// ---------------------------------------------------------------------------
// child() — sub-loggers
// ---------------------------------------------------------------------------

describe('child', () => {
  it('merges extra context into every log entry', () => {
    const { lines, writer } = collect();
    const log = createLogger('parent', {}, writer);
    const child = log.child({ requestId: 'abc-123' });

    child.info('handled');

    const entry = parse(lines[0]!);
    expect(entry.component).toBe('parent');
    expect(entry.requestId).toBe('abc-123');
    expect(entry.msg).toBe('handled');
  });

  it('preserves parent context and adds new fields', () => {
    const { lines, writer } = collect();
    const log = createLogger('svc', { env: 'test' }, writer);
    const child = log.child({ worker: 'w1' });

    child.info('ready');

    const entry = parse(lines[0]!);
    expect(entry.env).toBe('test');
    expect(entry.worker).toBe('w1');
  });

  it('allows per-call context to override child context', () => {
    const { lines, writer } = collect();
    const log = createLogger('svc', {}, writer);
    const child = log.child({ status: 'pending' });

    child.info('done', { status: 'complete' });

    const entry = parse(lines[0]!);
    expect(entry.status).toBe('complete');
  });

  it('supports chaining multiple child levels', () => {
    const { lines, writer } = collect();
    const log = createLogger('root', {}, writer);
    const c1 = log.child({ a: 1 });
    const c2 = c1.child({ b: 2 });

    c2.info('deep');

    const entry = parse(lines[0]!);
    expect(entry.a).toBe(1);
    expect(entry.b).toBe(2);
    expect(entry.component).toBe('root');
  });
});
