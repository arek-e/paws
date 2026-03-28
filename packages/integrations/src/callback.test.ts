import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { postComment } from './callback.js';
import type { CallbackDeps } from './callback.js';

const mockAuth = {
  getInstallationToken: vi.fn().mockResolvedValue('ghs_test_token'),
};

const deps: CallbackDeps = { auth: mockAuth };

beforeEach(() => {
  vi.useFakeTimers();
  vi.restoreAllMocks();
  mockAuth.getInstallationToken = vi.fn().mockResolvedValue('ghs_test_token');
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('postComment', () => {
  test('posts comment successfully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
    });
    vi.stubGlobal('fetch', mockFetch);

    await postComment(
      deps,
      12345,
      'https://api.github.com/repos/org/repo/issues/42',
      'Session completed successfully.',
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/org/repo/issues/42/comments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer ghs_test_token',
        }),
        body: JSON.stringify({ body: 'Session completed successfully.' }),
      }),
    );
  });

  test('retries on 429 rate limit', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'rate limited',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
      });
    vi.stubGlobal('fetch', mockFetch);

    const promise = postComment(
      deps,
      12345,
      'https://api.github.com/repos/org/repo/issues/42',
      'result',
    );

    // Advance past the retry delay (attempt 0: 2000ms)
    await vi.advanceTimersByTimeAsync(10_000);

    await promise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test('throws on non-retryable error (404)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'not found',
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      postComment(deps, 12345, 'https://api.github.com/repos/org/repo/issues/42', 'result'),
    ).rejects.toThrow('GitHub comment post failed: 404 not found');

    expect(mockFetch).toHaveBeenCalledOnce();
  });

  test('gives up after 3 retries', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    });
    vi.stubGlobal('fetch', mockFetch);

    const promise = postComment(
      deps,
      12345,
      'https://api.github.com/repos/org/repo/issues/42',
      'result',
    );

    // Attach rejection handler immediately to prevent unhandled rejection
    const result = promise.catch((e: Error) => e);

    // Advance past all retry delays: 2000 + 4000 + 6000 = 12000ms
    await vi.advanceTimersByTimeAsync(20_000);

    const error = await result;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('GitHub API 429');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
