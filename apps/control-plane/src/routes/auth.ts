import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { getAuth, oidcAuthMiddleware, processOAuthCallback, revokeSession } from '@hono/oidc-auth';

import { createLogger } from '@paws/logger';

const log = createLogger('auth');

/** Auth routes for OIDC login flow (browser-based, not OpenAPI) */
export function createAuthRoutes() {
  const app = new Hono();

  // Login: clear stale cookies, then oidcAuthMiddleware redirects to Dex
  app.use('/auth/login', async (c, next) => {
    deleteCookie(c, 'oidc-auth', { path: '/' });
    await next();
  });

  app.get(
    '/auth/login',
    async (c, next) => {
      await next();
      // After oidcAuthMiddleware sets the continue cookie to /auth/login,
      // override it to point to the dashboard root instead
      setCookie(c, 'continue', '/', {
        path: '/auth/callback',
        httpOnly: true,
        secure: true,
      });
    },
    oidcAuthMiddleware(),
    (c) => {
      return c.redirect('/');
    },
  );

  // Callback: process the code exchange directly (don't use oidcAuthMiddleware
  // here — behind a reverse proxy, the origin mismatch causes it to start a
  // new auth flow instead of processing the callback)
  app.get('/auth/callback', async (c) => {
    try {
      return await processOAuthCallback(c);
    } catch (err) {
      log.error('Callback error', { error: String(err) });
      return c.redirect('/auth/login');
    }
  });

  // Logout
  app.get('/auth/logout', async (c) => {
    try {
      await revokeSession(c);
    } catch {
      /* ignore */
    }
    deleteCookie(c, 'oidc-auth', { path: '/' });
    return c.redirect('/');
  });

  app.post('/auth/logout', async (c) => {
    try {
      await revokeSession(c);
    } catch {
      /* ignore */
    }
    deleteCookie(c, 'oidc-auth', { path: '/' });
    return c.redirect('/');
  });

  // Current user info
  app.get('/auth/me', async (c) => {
    try {
      const auth = await getAuth(c);
      if (!auth) {
        return c.json({ authenticated: false }, 401);
      }
      return c.json({
        authenticated: true,
        email: auth.email,
        sub: auth.sub,
      });
    } catch {
      return c.json({ authenticated: false }, 401);
    }
  });

  return app;
}
