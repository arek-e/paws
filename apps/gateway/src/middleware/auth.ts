import type { Context, Next } from 'hono';

/** Bearer token auth middleware */
export function authMiddleware(apiKey: string) {
  return async (c: Context, next: Next) => {
    const header = c.req.header('Authorization');
    if (!header) {
      return c.json(
        { error: { code: 'UNAUTHORIZED', message: 'Missing Authorization header' } },
        401,
      );
    }

    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || token !== apiKey) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } }, 401);
    }

    await next();
  };
}
