import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock jose before importing the module under test
vi.mock('jose', () => {
  class MockSignJWT {
    setProtectedHeader() {
      return this;
    }
    setIssuer() {
      return this;
    }
    setIssuedAt() {
      return this;
    }
    setExpirationTime() {
      return this;
    }
    async sign() {
      return 'eyJhbGciOiJSUzI1NiJ9.mock.jwt';
    }
  }
  return {
    importPKCS8: vi.fn().mockResolvedValue('mock-key'),
    SignJWT: MockSignJWT,
  };
});

import { createGitHubAuth } from './github-auth.js';

const TEST_APP_ID = '12345';
const TEST_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nfake-key-data\n-----END PRIVATE KEY-----';

function stubFetch(impl?: (...args: unknown[]) => unknown) {
  const fn = vi.fn(impl);
  (globalThis as Record<string, unknown>).fetch = fn;
  return fn;
}

describe('createGitHubAuth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an object with getInstallationToken', () => {
    const auth = createGitHubAuth(TEST_APP_ID, TEST_PRIVATE_KEY);
    expect(auth).toHaveProperty('getInstallationToken');
    expect(typeof auth.getInstallationToken).toBe('function');
  });

  it('fetches installation token from GitHub API', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          token: 'ghs_test_token_123',
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        }),
      text: () => Promise.resolve(''),
    };

    const fetchFn = stubFetch(() => Promise.resolve(mockResponse));

    const auth = createGitHubAuth(TEST_APP_ID, TEST_PRIVATE_KEY);
    const token = await auth.getInstallationToken(99);

    expect(token).toBe('ghs_test_token_123');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchFn.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string> },
    ];
    expect(url).toBe('https://api.github.com/app/installations/99/access_tokens');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Accept']).toBe('application/vnd.github+json');
    expect(opts.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    expect(opts.headers['Authorization']).toMatch(/^Bearer eyJ/);
  });

  it('caches token and reuses on second call', async () => {
    const expiresAt = new Date(Date.now() + 3600_000).toISOString();
    const mockResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          token: 'ghs_cached_token',
          expires_at: expiresAt,
        }),
      text: () => Promise.resolve(''),
    };

    const fetchFn = stubFetch(() => Promise.resolve(mockResponse));

    const auth = createGitHubAuth(TEST_APP_ID, TEST_PRIVATE_KEY);
    const token1 = await auth.getInstallationToken(99);
    const token2 = await auth.getInstallationToken(99);

    expect(token1).toBe('ghs_cached_token');
    expect(token2).toBe('ghs_cached_token');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('re-fetches when cached token is near expiry', async () => {
    const nearExpiry = new Date(Date.now() + 2 * 60_000).toISOString();
    const farExpiry = new Date(Date.now() + 3600_000).toISOString();

    let callCount = 0;
    const fetchFn = stubFetch(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            token: `ghs_token_${callCount}`,
            expires_at: callCount === 1 ? nearExpiry : farExpiry,
          }),
        text: () => Promise.resolve(''),
      });
    });

    const auth = createGitHubAuth(TEST_APP_ID, TEST_PRIVATE_KEY);
    await auth.getInstallationToken(99);
    const token2 = await auth.getInstallationToken(99);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(token2).toBe('ghs_token_2');
  });

  it('uses separate cache entries for different installation IDs', async () => {
    let callCount = 0;
    const fetchFn = stubFetch(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            token: `ghs_token_${callCount}`,
            expires_at: new Date(Date.now() + 3600_000).toISOString(),
          }),
        text: () => Promise.resolve(''),
      });
    });

    const auth = createGitHubAuth(TEST_APP_ID, TEST_PRIVATE_KEY);
    const token1 = await auth.getInstallationToken(100);
    const token2 = await auth.getInstallationToken(200);

    expect(token1).toBe('ghs_token_1');
    expect(token2).toBe('ghs_token_2');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('throws on non-OK response from GitHub', async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Bad credentials'),
      }),
    );

    const auth = createGitHubAuth(TEST_APP_ID, TEST_PRIVATE_KEY);
    await expect(auth.getInstallationToken(99)).rejects.toThrow(
      'GitHub token exchange failed: 401 Bad credentials',
    );
  });
});
