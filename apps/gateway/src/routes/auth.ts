import { Hono } from 'hono';
import { getAuth, oidcAuthMiddleware, processOAuthCallback, revokeSession } from '@hono/oidc-auth';

/** Auth routes for OIDC login flow (browser-based, not OpenAPI) */
export function createAuthRoutes() {
  const app = new Hono();

  // Login: the oidcAuthMiddleware checks for a session. If no session,
  // it redirects to the OIDC provider's authorize endpoint automatically.
  app.get('/auth/login', oidcAuthMiddleware(), (c) => {
    // If we get here, user is already authenticated — redirect to dashboard
    return c.redirect('/');
  });

  // OIDC callback: exchange code for tokens, set session cookie
  app.get('/auth/callback', async (c) => {
    return processOAuthCallback(c);
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
