import { Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { getAuth, oidcAuthMiddleware, processOAuthCallback, revokeSession } from '@hono/oidc-auth';

/** Auth routes for OIDC login flow (browser-based, not OpenAPI) */
export function createAuthRoutes() {
  const app = new Hono();

  // Login: clear any stale cookies first, then use oidcAuthMiddleware
  // which redirects to the OIDC provider if no valid session exists.
  app.get(
    '/auth/login',
    async (c, next) => {
      // Clear stale session cookie to avoid "Invalid session" errors
      deleteCookie(c, 'oidc-auth', { path: '/' });
      deleteCookie(c, 'state', { path: '/auth/callback' });
      deleteCookie(c, 'nonce', { path: '/auth/callback' });
      deleteCookie(c, 'code_verifier', { path: '/auth/callback' });
      await next();
    },
    oidcAuthMiddleware(),
    (c) => {
      // If we get here, user is already authenticated
      return c.redirect('/');
    },
  );

  // OIDC callback: exchange code for tokens, set session cookie
  app.get('/auth/callback', async (c) => {
    try {
      return await processOAuthCallback(c);
    } catch {
      // If callback fails (stale state, expired code), redirect to login
      return c.redirect('/auth/login');
    }
  });

  // Logout
  app.post('/auth/logout', async (c) => {
    await revokeSession(c);
    return c.redirect('/');
  });

  app.get('/auth/logout', async (c) => {
    await revokeSession(c);
    return c.redirect('/');
  });

  // Current user info
  app.get('/auth/me', async (c) => {
    const auth = await getAuth(c);
    if (!auth) {
      return c.json({ authenticated: false }, 401);
    }
    return c.json({
      authenticated: true,
      email: auth.email,
      sub: auth.sub,
    });
  });

  return app;
}
