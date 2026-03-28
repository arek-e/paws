import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { getAuth, processOAuthCallback, revokeSession } from '@hono/oidc-auth';

/** Auth routes for OIDC login flow (browser-based, not OpenAPI) */
export function createAuthRoutes() {
  const app = new Hono();

  // Login: clear stale cookies, redirect to Dex via oidcAuthMiddleware
  app.get('/auth/login', async (c) => {
    // Clear stale session cookies
    deleteCookie(c, 'oidc-auth', { path: '/' });
    deleteCookie(c, 'state', { path: '/auth/callback' });
    deleteCookie(c, 'nonce', { path: '/auth/callback' });
    deleteCookie(c, 'code_verifier', { path: '/auth/callback' });
    deleteCookie(c, 'continue', { path: '/auth/callback' });

    // Import and use the middleware inline to build the Dex auth URL
    const { oidcAuthMiddleware } = await import('@hono/oidc-auth');
    const mw = oidcAuthMiddleware();

    // Override continue to point to dashboard root
    setCookie(c, 'continue', 'https://fleet.tpops.dev/', {
      path: '/auth/callback',
      httpOnly: true,
      secure: true,
    });

    // This will redirect to Dex (since we cleared the session cookie)
    return mw(c, async () => {
      // If somehow already authed, go to dashboard
      return c.redirect('/');
    });
  });

  // OIDC callback: exchange code for tokens, set session cookie
  app.get('/auth/callback', async (c) => {
    try {
      // Force the continue URL to be the dashboard
      const url = new URL(c.req.url);
      if (url.searchParams.has('code')) {
        // Override continue cookie before processOAuthCallback reads it
        setCookie(c, 'continue', 'https://fleet.tpops.dev/', {
          path: '/auth/callback',
          httpOnly: true,
          secure: true,
        });
      }
      return await processOAuthCallback(c);
    } catch {
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
