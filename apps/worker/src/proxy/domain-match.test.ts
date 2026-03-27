import { describe, expect, test } from 'vitest';

import { findCredentials, matchesDomain } from './domain-match.js';

describe('matchesDomain', () => {
  test('exact match', () => {
    expect(matchesDomain('api.anthropic.com', ['api.anthropic.com'])).toBe(true);
  });

  test('exact match is case-insensitive', () => {
    expect(matchesDomain('API.Anthropic.COM', ['api.anthropic.com'])).toBe(true);
  });

  test('no match for different domain', () => {
    expect(matchesDomain('evil.com', ['api.anthropic.com'])).toBe(false);
  });

  test('wildcard matches subdomain', () => {
    expect(matchesDomain('foo.github.com', ['*.github.com'])).toBe(true);
  });

  test('wildcard does not match base domain', () => {
    expect(matchesDomain('github.com', ['*.github.com'])).toBe(false);
  });

  test('wildcard matches deeply nested subdomain', () => {
    expect(matchesDomain('a.b.c.github.com', ['*.github.com'])).toBe(true);
  });

  test('wildcard is case-insensitive', () => {
    expect(matchesDomain('FOO.GitHub.COM', ['*.github.com'])).toBe(true);
  });

  test('empty patterns matches nothing', () => {
    expect(matchesDomain('anything.com', [])).toBe(false);
  });

  test('multiple patterns — matches first', () => {
    expect(matchesDomain('api.anthropic.com', ['api.anthropic.com', '*.openai.com'])).toBe(true);
  });

  test('multiple patterns — matches second', () => {
    expect(matchesDomain('api.openai.com', ['api.anthropic.com', '*.openai.com'])).toBe(true);
  });

  test('partial hostname does not match', () => {
    expect(matchesDomain('notgithub.com', ['github.com'])).toBe(false);
  });

  test('wildcard does not match partial suffix', () => {
    expect(matchesDomain('evilgithub.com', ['*.github.com'])).toBe(false);
  });
});

describe('findCredentials', () => {
  const creds = {
    'api.anthropic.com': { headers: { 'x-api-key': 'sk-ant-123' } },
    '*.github.com': { headers: { Authorization: 'Bearer ghp_abc' } },
  };

  test('exact match returns headers', () => {
    expect(findCredentials('api.anthropic.com', creds)).toEqual({ 'x-api-key': 'sk-ant-123' });
  });

  test('wildcard match returns headers', () => {
    expect(findCredentials('raw.github.com', creds)).toEqual({ Authorization: 'Bearer ghp_abc' });
  });

  test('no match returns undefined', () => {
    expect(findCredentials('evil.com', creds)).toBeUndefined();
  });

  test('exact match takes precedence over wildcard', () => {
    const mixed = {
      '*.example.com': { headers: { auth: 'wildcard' } },
      'api.example.com': { headers: { auth: 'exact' } },
    };
    expect(findCredentials('api.example.com', mixed)).toEqual({ auth: 'exact' });
  });

  test('empty credentials returns undefined', () => {
    expect(findCredentials('anything.com', {})).toBeUndefined();
  });

  test('case-insensitive matching', () => {
    expect(findCredentials('API.Anthropic.COM', creds)).toEqual({ 'x-api-key': 'sk-ant-123' });
  });
});
