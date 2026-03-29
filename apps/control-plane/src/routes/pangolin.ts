import { Hono } from 'hono';

import type { PangolinAdmin } from '../pangolin-admin.js';

/**
 * Proxy routes for Pangolin admin operations.
 * All routes require auth (applied via middleware in app.ts).
 */
export function createPangolinRoutes(admin: PangolinAdmin) {
  const app = new Hono();

  // --- Status ---
  app.get('/status', async (c) => {
    const status = await admin.status();
    return c.json(status);
  });

  // --- Resources (tunnels) ---
  app.get('/resources', async (c) => {
    try {
      const resources = await admin.listResources();
      return c.json({ resources });
    } catch (err) {
      return c.json({ error: { code: 'PANGOLIN_ERROR', message: String(err) } }, 502);
    }
  });

  app.delete('/resources/:id', async (c) => {
    try {
      await admin.deleteResource(c.req.param('id'));
      return c.body(null, 204);
    } catch (err) {
      return c.json({ error: { code: 'PANGOLIN_ERROR', message: String(err) } }, 502);
    }
  });

  // --- Sites (workers) ---
  app.get('/sites', async (c) => {
    try {
      const sites = await admin.listSites();
      return c.json({ sites });
    } catch (err) {
      return c.json({ error: { code: 'PANGOLIN_ERROR', message: String(err) } }, 502);
    }
  });

  app.post('/sites', async (c) => {
    try {
      const { name } = await c.req.json<{ name: string }>();
      const result = await admin.createSite(name);
      return c.json(result, 201);
    } catch (err) {
      return c.json({ error: { code: 'PANGOLIN_ERROR', message: String(err) } }, 502);
    }
  });

  app.delete('/sites/:id', async (c) => {
    try {
      await admin.deleteSite(c.req.param('id'));
      return c.body(null, 204);
    } catch (err) {
      return c.json({ error: { code: 'PANGOLIN_ERROR', message: String(err) } }, 502);
    }
  });

  // --- Domains ---
  app.get('/domains', async (c) => {
    try {
      const domains = await admin.listDomains();
      return c.json({ domains });
    } catch (err) {
      return c.json({ error: { code: 'PANGOLIN_ERROR', message: String(err) } }, 502);
    }
  });

  // --- Users ---
  app.get('/users', async (c) => {
    try {
      const users = await admin.listUsers();
      return c.json({ users });
    } catch (err) {
      return c.json({ error: { code: 'PANGOLIN_ERROR', message: String(err) } }, 502);
    }
  });

  app.post('/users/invite', async (c) => {
    try {
      const { email, roleId } = await c.req.json<{ email: string; roleId?: string }>();
      await admin.inviteUser(email, roleId);
      return c.json({ invited: true, email }, 201);
    } catch (err) {
      return c.json({ error: { code: 'PANGOLIN_ERROR', message: String(err) } }, 502);
    }
  });

  app.delete('/users/:id', async (c) => {
    try {
      await admin.removeUser(c.req.param('id'));
      return c.body(null, 204);
    } catch (err) {
      return c.json({ error: { code: 'PANGOLIN_ERROR', message: String(err) } }, 502);
    }
  });

  // --- Identity Providers ---
  app.get('/idps', async (c) => {
    try {
      const idps = await admin.listIdps();
      return c.json({ idps });
    } catch (err) {
      return c.json({ error: { code: 'PANGOLIN_ERROR', message: String(err) } }, 502);
    }
  });

  app.post('/idps/oidc', async (c) => {
    try {
      const body = await c.req.json<{
        name: string;
        clientId: string;
        clientSecret: string;
        authUrl: string;
        tokenUrl: string;
      }>();
      const result = await admin.createOidcIdp(body);
      return c.json(result, 201);
    } catch (err) {
      return c.json({ error: { code: 'PANGOLIN_ERROR', message: String(err) } }, 502);
    }
  });

  app.delete('/idps/:id', async (c) => {
    try {
      await admin.deleteIdp(parseInt(c.req.param('id'), 10));
      return c.body(null, 204);
    } catch (err) {
      return c.json({ error: { code: 'PANGOLIN_ERROR', message: String(err) } }, 502);
    }
  });

  return app;
}
