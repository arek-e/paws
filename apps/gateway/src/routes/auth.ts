import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { getAuth, oidcAuthMiddleware, processOAuthCallback, revokeSession } from '@hono/oidc-auth';

/** Auth routes for OIDC login flow (browser-based, not OpenAPI) */
export function createAuthRoutes() {
  const app = new Hono();

  // Login: clear stale cookies, set continue to dashboard root, then redirect to Dex
  app.get(
    '/auth/login',
    async (c, next) => {
      // Clear stale cookies
      deleteCookie(c, 'oidc-auth', { path: '/' });
      deleteCookie(c, 'state', { path: '/auth/callback' });
      deleteCookie(c, 'nonce', { path: '/auth/callback' });
      deleteCookie(c, 'code_verifier', { path: '/auth/callback' });
      deleteCookie(c, 'continue', { path: '/auth/callback' });
      await next();
    },
    oidcAuthMiddleware(),
    (c) => {
      // Already authenticated — go to dashboard
      return c.redirect('/');
    },
  );

  // OIDC callback: exchange code for tokens, set session cookie, redirect to dashboard
  app.get('/auth/callback', async (c) => {
    try {
      // Override the continue cookie to always redirect to dashboard root
      setCookie(c, 'continue', '/', {
        path: '/auth/callback',
        httpOnly: true,
        secure: true,
      });
      return await processOAuthCallback(c);
    } catch {
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
