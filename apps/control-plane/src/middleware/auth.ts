import type { Context, Next } from 'hono';

import type { PasswordAuth } from '../auth/password.js';

export interface AuthConfig {
  apiKey: string;
  /** When true, also check OIDC session cookie (requires @hono/oidc-auth init) */
  oidcEnabled?: boolean;
  /** Password auth instance for session cookie validation */
  passwordAuth?: PasswordAuth;
}

/** Multi-auth middleware: OIDC session → password session cookie → Bearer API key */
export function authMiddleware(config: AuthConfig) {
  const { apiKey, oidcEnabled = false, passwordAuth } = config;

  return async (c: Context, next: Next) => {
    // 1. Check OIDC session cookie (dashboard users with SSO)
    if (oidcEnabled) {
      try {
        const { getAuth } = await import('@hono/oidc-auth');
        const auth = await getAuth(c);
        if (auth) {
          c.set('oidcAuth', auth);
          return next();
        }
      } catch {
        // OIDC not configured or session invalid
      }
    }

    // 2. Check password session cookie (dashboard users on bare IP)
    if (passwordAuth) {
      const cookies = c.req.header('cookie') ?? '';
      const match = cookies.match(/paws_session=([^;]+)/);
      const sessionToken = match?.[1];
      if (sessionToken) {
        const session = passwordAuth.validateSession(sessionToken);
        if (session) {
          return next();
        }
      }
    }

    // 3. Check Bearer API key (SDK/CLI/programmatic clients)
    const header = c.req.header('Authorization');
    if (header) {
      const [scheme, token] = header.split(' ');
      if (scheme === 'Bearer' && token === apiKey) {
        return next();
      }
    }

    // 4. Unauthorized
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid or missing authentication' } },
      401,
    );
  };
}
