import { describe, expect, test, vi, afterEach, beforeEach } from 'vitest';

import { createVersionChecker } from './version-checker.js';

describe('createVersionChecker', () => {
  const originalFetch = globalThis.fetch;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env['DISABLE_UPDATE_CHECK'];
    process.env['DISABLE_UPDATE_CHECK'] = 'true';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) {
      delete process.env['DISABLE_UPDATE_CHECK'];
    } else {
      process.env['DISABLE_UPDATE_CHECK'] = originalEnv;
    }
  });

  function mockFetch(response: Record<string, unknown>) {
    const fn = vi.fn().mockResolvedValue(response);
    globalThis.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  test('getInfo returns current version when no check performed', () => {
    const checker = createVersionChecker('1.0.0');
    const info = checker.getInfo();

    expect(info.current).toBe('1.0.0');
    expect(info.latest).toBe('1.0.0');
    expect(info.updateAvailable).toBe(false);
    expect(info.checkedAt).toBeNull();
    checker.stop();
  });

  test('checkNow fetches latest version from GitHub', async () => {
    delete process.env['DISABLE_UPDATE_CHECK'];
    mockFetch({
      ok: true,
      json: async () => ({
        tag_name: 'v2.0.0',
        html_url: 'https://github.com/arek-e/paws/releases/tag/v2.0.0',
        body: 'Release notes',
      }),
    });

    const checker = createVersionChecker('1.0.0');
    const info = await checker.checkNow();

    expect(info.latest).toBe('2.0.0');
    expect(info.updateAvailable).toBe(true);
    expect(info.releaseUrl).toBe('https://github.com/arek-e/paws/releases/tag/v2.0.0');
    expect(info.changelog).toBe('Release notes');
    expect(info.checkedAt).toBeDefined();
    checker.stop();
  });

  test('updateAvailable is false when versions are equal', async () => {
    delete process.env['DISABLE_UPDATE_CHECK'];
    mockFetch({
      ok: true,
      json: async () => ({
        tag_name: 'v1.0.0',
        html_url: 'https://github.com/arek-e/paws/releases/tag/v1.0.0',
      }),
    });

    const checker = createVersionChecker('1.0.0');
    const info = await checker.checkNow();

    expect(info.updateAvailable).toBe(false);
    checker.stop();
  });

  test('handles fetch failure gracefully', async () => {
    delete process.env['DISABLE_UPDATE_CHECK'];
    const fn = vi.fn().mockRejectedValue(new Error('Network error'));
    globalThis.fetch = fn as unknown as typeof fetch;

    const checker = createVersionChecker('1.0.0');
    const info = await checker.checkNow();

    expect(info.current).toBe('1.0.0');
    expect(info.latest).toBe('1.0.0');
    expect(info.updateAvailable).toBe(false);
    checker.stop();
  });

  test('handles non-ok response gracefully', async () => {
    delete process.env['DISABLE_UPDATE_CHECK'];
    mockFetch({ ok: false, status: 404 });

    const checker = createVersionChecker('1.0.0');
    const info = await checker.checkNow();

    expect(info.latest).toBe('1.0.0');
    checker.stop();
  });

  test('stop clears interval timer', () => {
    const checker = createVersionChecker('1.0.0');
    checker.stop();
    checker.stop(); // double-stop is safe
  });
});
