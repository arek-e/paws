import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createCredentialResolver, CredentialResolutionError } from './resolver.js';
import { createCredentialStore } from './store.js';

describe('createCredentialResolver', () => {
  const store = createCredentialStore('test-secret');
  const resolver = createCredentialResolver(store);

  beforeEach(async () => {
    await store.upsert('anthropic', 'sk-ant-test-key-123');
    await store.upsert('github', 'ghp_test-github-token');
  });

  afterEach(() => {
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['CUSTOM_SECRET'];
    store.delete('anthropic');
    store.delete('github');
    store.delete('openai');
  });

  describe('resolveValue', () => {
    test('passes through literal values unchanged', async () => {
      expect(await resolver.resolveValue('sk-ant-literal-key')).toBe('sk-ant-literal-key');
    });

    test('passes through empty string', async () => {
      expect(await resolver.resolveValue('')).toBe('');
    });

    test('resolves $REF from environment variable', async () => {
      process.env['CUSTOM_SECRET'] = 'env-secret-value';
      expect(await resolver.resolveValue('$CUSTOM_SECRET')).toBe('env-secret-value');
    });

    test('resolves $ANTHROPIC_API_KEY from credential store as fallback', async () => {
      // No env var set — should fall back to store
      expect(await resolver.resolveValue('$ANTHROPIC_API_KEY')).toBe('sk-ant-test-key-123');
    });

    test('env var takes priority over credential store', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'env-takes-priority';
      expect(await resolver.resolveValue('$ANTHROPIC_API_KEY')).toBe('env-takes-priority');
    });

    test('resolves $GITHUB_TOKEN from credential store', async () => {
      expect(await resolver.resolveValue('$GITHUB_TOKEN')).toBe('ghp_test-github-token');
    });

    test('throws CredentialResolutionError for unresolved reference', async () => {
      await expect(resolver.resolveValue('$NONEXISTENT_KEY')).rejects.toThrow(
        CredentialResolutionError,
      );
      await expect(resolver.resolveValue('$NONEXISTENT_KEY')).rejects.toThrow(
        'Credential $NONEXISTENT_KEY not found',
      );
    });
  });

  describe('resolveCredentials', () => {
    test('resolves $REFERENCES in credential headers', async () => {
      process.env['CUSTOM_SECRET'] = 'resolved-value';

      const result = await resolver.resolveCredentials({
        'api.example.com': {
          headers: { Authorization: '$CUSTOM_SECRET' },
        },
      });

      expect(result['api.example.com']!.headers['Authorization']).toBe('resolved-value');
    });

    test('passes through literal headers unchanged', async () => {
      const result = await resolver.resolveCredentials({
        'api.example.com': {
          headers: { 'x-api-key': 'literal-key-value' },
        },
      });

      expect(result['api.example.com']!.headers['x-api-key']).toBe('literal-key-value');
    });

    test('resolves mixed literal and reference headers', async () => {
      process.env['CUSTOM_SECRET'] = 'secret-from-env';

      const result = await resolver.resolveCredentials({
        'api.example.com': {
          headers: {
            'x-api-key': '$CUSTOM_SECRET',
            'x-custom': 'literal-value',
          },
        },
      });

      expect(result['api.example.com']!.headers['x-api-key']).toBe('secret-from-env');
      expect(result['api.example.com']!.headers['x-custom']).toBe('literal-value');
    });

    test('resolves credentials across multiple domains', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'ant-from-env';

      const result = await resolver.resolveCredentials({
        'api.anthropic.com': {
          headers: { 'x-api-key': '$ANTHROPIC_API_KEY' },
        },
        'github.com': {
          headers: { Authorization: '$GITHUB_TOKEN' },
        },
      });

      expect(result['api.anthropic.com']!.headers['x-api-key']).toBe('ant-from-env');
      // GITHUB_TOKEN not in env, falls back to store
      expect(result['github.com']!.headers['Authorization']).toBe('ghp_test-github-token');
    });

    test('throws on any unresolved reference', async () => {
      await expect(
        resolver.resolveCredentials({
          'api.example.com': {
            headers: { 'x-api-key': '$DOES_NOT_EXIST' },
          },
        }),
      ).rejects.toThrow(CredentialResolutionError);
    });

    test('handles empty credentials map', async () => {
      const result = await resolver.resolveCredentials({});
      expect(result).toEqual({});
    });
  });

  describe('autoInject', () => {
    test('injects stored credential for matching domain', async () => {
      const result = await resolver.autoInject(['api.anthropic.com'], {});

      expect(result['api.anthropic.com']).toBeDefined();
      expect(result['api.anthropic.com']!.headers['x-api-key']).toBe('sk-ant-test-key-123');
    });

    test('injects Bearer template for github', async () => {
      const result = await resolver.autoInject(['github.com'], {});

      expect(result['github.com']!.headers['Authorization']).toBe('Bearer ghp_test-github-token');
    });

    test('does not override explicit credentials', async () => {
      const result = await resolver.autoInject(['api.anthropic.com'], {
        'api.anthropic.com': { headers: { 'x-api-key': 'explicit-key' } },
      });

      expect(result['api.anthropic.com']!.headers['x-api-key']).toBe('explicit-key');
    });

    test('skips domains with no matching provider', async () => {
      const result = await resolver.autoInject(['api.example.com'], {});

      expect(result['api.example.com']).toBeUndefined();
    });

    test('skips providers with no stored credential', async () => {
      // openai has no credential stored in beforeEach
      const result = await resolver.autoInject(['api.openai.com'], {});

      expect(result['api.openai.com']).toBeUndefined();
    });

    test('injects multiple domains at once', async () => {
      const result = await resolver.autoInject(
        ['api.anthropic.com', 'github.com', 'api.example.com'],
        {},
      );

      expect(result['api.anthropic.com']).toBeDefined();
      expect(result['github.com']).toBeDefined();
      expect(result['api.example.com']).toBeUndefined();
    });

    test('mixes auto-injected and explicit credentials', async () => {
      const result = await resolver.autoInject(['api.anthropic.com', 'github.com'], {
        'github.com': { headers: { Authorization: 'Bearer my-explicit-token' } },
      });

      // anthropic auto-injected
      expect(result['api.anthropic.com']!.headers['x-api-key']).toBe('sk-ant-test-key-123');
      // github kept explicit
      expect(result['github.com']!.headers['Authorization']).toBe('Bearer my-explicit-token');
    });
  });
});
