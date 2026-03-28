import { describe, expect, it } from 'vitest';

import { parseArgs, resolveConfig } from './config.js';

describe('resolveConfig', () => {
  it('resolves from env vars', () => {
    const config = resolveConfig({
      flags: {},
      env: { PAWS_URL: 'http://localhost:4000', PAWS_API_KEY: 'key-123' },
    });
    expect(config.url).toBe('http://localhost:4000');
    expect(config.apiKey).toBe('key-123');
  });

  it('flags take precedence over env vars', () => {
    const config = resolveConfig({
      flags: { url: 'http://flag-url', 'api-key': 'flag-key' },
      env: { PAWS_URL: 'http://env-url', PAWS_API_KEY: 'env-key' },
    });
    expect(config.url).toBe('http://flag-url');
    expect(config.apiKey).toBe('flag-key');
  });

  it('throws when url is missing', () => {
    expect(() => resolveConfig({ flags: {}, env: { PAWS_API_KEY: 'key' } })).toThrow(
      'Missing gateway URL',
    );
  });

  it('throws when api key is missing', () => {
    expect(() => resolveConfig({ flags: {}, env: { PAWS_URL: 'http://localhost' } })).toThrow(
      'Missing API key',
    );
  });

  it('uses flag url with env api key', () => {
    const config = resolveConfig({
      flags: { url: 'http://flag-url' },
      env: { PAWS_API_KEY: 'env-key' },
    });
    expect(config.url).toBe('http://flag-url');
    expect(config.apiKey).toBe('env-key');
  });
});

describe('parseArgs', () => {
  it('parses resource and action', () => {
    const result = parseArgs(['sessions', 'create']);
    expect(result.resource).toBe('sessions');
    expect(result.action).toBe('create');
    expect(result.positional).toBeUndefined();
  });

  it('parses positional argument', () => {
    const result = parseArgs(['sessions', 'get', 'ses_abc123']);
    expect(result.resource).toBe('sessions');
    expect(result.action).toBe('get');
    expect(result.positional).toBe('ses_abc123');
  });

  it('parses flags with values', () => {
    const result = parseArgs([
      'sessions',
      'create',
      '--snapshot',
      'agent-latest',
      '--script',
      'echo hi',
    ]);
    expect(result.flags['snapshot']).toBe('agent-latest');
    expect(result.flags['script']).toBe('echo hi');
  });

  it('parses boolean flags', () => {
    const result = parseArgs(['fleet', 'status', '--pretty']);
    expect(result.flags['pretty']).toBe('true');
  });

  it('parses global flags mixed with positionals', () => {
    const result = parseArgs([
      '--url',
      'http://localhost',
      'sessions',
      'get',
      'id1',
      '--api-key',
      'k',
    ]);
    expect(result.flags['url']).toBe('http://localhost');
    expect(result.flags['api-key']).toBe('k');
    expect(result.resource).toBe('sessions');
    expect(result.action).toBe('get');
    expect(result.positional).toBe('id1');
  });

  it('returns undefined for missing resource', () => {
    const result = parseArgs(['--pretty']);
    expect(result.resource).toBeUndefined();
    expect(result.action).toBeUndefined();
  });
});
