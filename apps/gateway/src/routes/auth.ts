import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { getAuth, oidcAuthMiddleware, processOAuthCallback, revokeSession } from '@hono/oidc-auth';

/** Auth routes for OIDC login flow (browser-based, not OpenAPI) */
export function createAuthRoutes() {
  const app = new Hono();

  // Login: use oidcAuthMiddleware which handles the full redirect-to-provider flow.
  // Prefix middleware clears stale cookies to prevent "Invalid session" errors.
  app.use('/auth/login', async (c, next) => {
    deleteCookie(c, 'oidc-auth', { path: '/' });
    // Set continue to dashboard root so callback redirects there
    setCookie(c, 'continue', 'https://fleet.tpops.dev/', {
      path: '/auth/callback',
      httpOnly: true,
      secure: true,
    });
    await next();
  });

  app.get('/auth/login', oidcAuthMiddleware(), (c) => {
    return c.redirect('/');
  });

  // OIDC callback: oidcAuthMiddleware auto-handles this path
  // (it checks if the URL matches OIDC_REDIRECT_URI and calls processOAuthCallback)
  app.get('/auth/callback', oidcAuthMiddleware(), (c) => {
    return c.redirect('/');
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
