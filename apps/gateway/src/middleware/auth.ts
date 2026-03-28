import type { Context, Next } from 'hono';

export interface AuthConfig {
  apiKey: string;
  /** When true, also check OIDC session cookie (requires @hono/oidc-auth init) */
  oidcEnabled?: boolean;
}

/** Dual auth middleware: OIDC session cookie OR Bearer API key */
export function authMiddleware(config: AuthConfig) {
  const { apiKey, oidcEnabled = false } = config;

  return async (c: Context, next: Next) => {
    // 1. Check OIDC session cookie (dashboard users)
    if (oidcEnabled) {
      try {
        const { getAuth } = await import('@hono/oidc-auth');
        const auth = await getAuth(c);
        if (auth) {
          c.set('oidcAuth', auth);
          return next();
        }
      } catch {
        // OIDC not configured or session invalid — fall through to API key
      }
    }

    // 2. Check Bearer API key (SDK/CLI/programmatic clients)
    const header = c.req.header('Authorization');
    if (header) {
      const [scheme, token] = header.split(' ');
      if (scheme === 'Bearer' && token === apiKey) {
        return next();
      }
    }

    // 3. Unauthorized
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid or missing authentication' } },
      401,
    );
  };
}
