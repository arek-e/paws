import { Hono } from 'hono';
import { describe, expect, test } from 'vitest';

import { authMiddleware } from './auth.js';

function createTestApp() {
  const app = new Hono();
  app.use('/protected/*', authMiddleware('secret-key'));
  app.get('/protected/resource', (c) => c.json({ ok: true }));
  return app;
}

describe('authMiddleware', () => {
  test('allows valid bearer token', async () => {
    const app = createTestApp();
    const res = await app.request('/protected/resource', {
      headers: { Authorization: 'Bearer secret-key' },
    });
    expect(res.status).toBe(200);
  });

  test('rejects missing authorization header', async () => {
    const app = createTestApp();
    const res = await app.request('/protected/resource');
    expect(res.status).toBe(401);
  });

  test('rejects wrong token', async () => {
    const app = createTestApp();
    const res = await app.request('/protected/resource', {
      headers: { Authorization: 'Bearer wrong' },
    });
    expect(res.status).toBe(401);
  });

  test('rejects non-bearer scheme', async () => {
    const app = createTestApp();
    const res = await app.request('/protected/resource', {
      headers: { Authorization: 'Basic secret-key' },
    });
    expect(res.status).toBe(401);
  });
});
