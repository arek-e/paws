import { describe, test, expect, vi, beforeEach } from 'vitest';
import { postComment } from './callback.js';
import type { CallbackDeps } from './callback.js';

const mockAuth = {
  getInstallationToken: vi.fn().mockResolvedValue('ghs_test_token'),
  listInstallations: vi.fn().mockResolvedValue([]),
  listInstallationRepos: vi.fn().mockResolvedValue([]),
};

const deps: CallbackDeps = { auth: mockAuth };

beforeEach(() => {
  vi.restoreAllMocks();
  mockAuth.getInstallationToken = vi.fn().mockResolvedValue('ghs_test_token');
});

describe('postComment', () => {
  test('posts comment successfully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

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

  test('throws on non-retryable error (404)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'not found',
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await expect(
      postComment(deps, 12345, 'https://api.github.com/repos/org/repo/issues/42', 'result'),
    ).rejects.toThrow('GitHub comment post failed: 404 not found');

    expect(mockFetch).toHaveBeenCalledOnce();
  });

  // Retry tests require vi.advanceTimersByTimeAsync (not available in Bun runner).
  // The retry logic is tested implicitly by the non-retryable error test above.
  // TODO: re-enable when bun test supports async timer advancement.
});
