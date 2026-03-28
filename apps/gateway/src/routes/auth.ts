import { Hono } from 'hono';
import { getAuth, processOAuthCallback, revokeSession } from '@hono/oidc-auth';

/** Auth routes for OIDC login flow (browser-based, not OpenAPI) */
export function createAuthRoutes() {
  const app = new Hono();

  // Login: redirect to OIDC provider
  // The oidcAuthMiddleware on the callback route handles the redirect automatically.
  // This explicit route provides a clean URL for the dashboard to link to.
  app.get('/auth/login', (c) => {
    // Redirect to the callback which triggers the OIDC flow
    return c.redirect('/auth/callback');
  });

  // OIDC callback: exchange code for tokens, set session cookie
  app.get('/auth/callback', async (c) => {
    // If this is the initial request (no code param), oidcAuthMiddleware
    // will redirect to the OIDC provider. When the provider redirects back
    // with a code, processOAuthCallback handles the exchange.
    const query = c.req.query('code');
    if (!query) {
      // No code = initial login request. The oidcAuthMiddleware on this route
      // will handle the redirect to the OIDC provider.
      return c.redirect('/auth/callback');
    }
    return processOAuthCallback(c);
  });

  // Logout: revoke session and redirect to login
  app.post('/auth/logout', async (c) => {
    await revokeSession(c);
    return c.redirect('/auth/login');
  });

  // Also support GET for easy logout links
  app.get('/auth/logout', async (c) => {
    await revokeSession(c);
    return c.redirect('/auth/login');
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
