import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { getAuth, oidcAuthMiddleware, processOAuthCallback, revokeSession } from '@hono/oidc-auth';

import { createLogger } from '@paws/logger';

const log = createLogger('auth');

export interface AuthRouteDeps {
  hasAdmin: () => boolean;
  promoteToAdmin: (email: string) => void;
  isAdmin: (email: string) => boolean;
}

/** Auth routes for OIDC login flow (browser-based, not OpenAPI) */
export function createAuthRoutes(adminDeps?: AuthRouteDeps) {
  const app = new Hono();

  app.use('/auth/login', async (c, next) => {
    deleteCookie(c, 'oidc-auth', { path: '/' });
    await next();
  });

  app.get(
    '/auth/login',
    async (c, next) => {
      await next();
      setCookie(c, 'continue', '/', { path: '/auth/callback', httpOnly: true, secure: true });
    },
    oidcAuthMiddleware(),
    (c) => c.redirect('/'),
  );

  app.get('/auth/callback', async (c) => {
    try {
      const response = await processOAuthCallback(c);
      if (adminDeps && !adminDeps.hasAdmin()) {
        try {
          const auth = await getAuth(c);
          if (auth?.email) {
            adminDeps.promoteToAdmin(auth.email);
            log.info('First OIDC user promoted to admin', { email: auth.email });
          }
        } catch {
          /* auth not ready yet */
        }
      }
      return response;
    } catch (err) {
      log.error('Callback error', { error: String(err) });
      return c.redirect('/auth/login');
    }
  });

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

  app.get('/auth/me', async (c) => {
    try {
      const auth = await getAuth(c);
      if (!auth) return c.json({ authenticated: false }, 401);
      const email = auth.email ?? '';
      if (adminDeps && email && !adminDeps.hasAdmin()) {
        adminDeps.promoteToAdmin(email);
        log.info('First OIDC user promoted to admin', { email });
      }
      return c.json({
        authenticated: true,
        email: auth.email,
        sub: auth.sub,
        isAdmin: adminDeps ? adminDeps.isAdmin(email) : false,
      });
    } catch {
      return c.json({ authenticated: false }, 401);
    }
  });

  return app;
}
