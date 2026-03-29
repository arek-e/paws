// Admin endpoint to list all waitlist entries.
// Protected by X-Admin-Key header — must match ADMIN_KEY env var.
//
// Usage:
//   curl -H "X-Admin-Key: <your-key>" https://getpaws.dev/api/waitlist-list

interface Env {
  WAITLIST?: KVNamespace;
  ADMIN_KEY?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const authHeader = context.request.headers.get('X-Admin-Key');
  const adminKey = context.env.ADMIN_KEY;

  if (!adminKey || authHeader !== adminKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!context.env.WAITLIST) {
    return new Response(
      JSON.stringify({ count: 0, entries: [], error: 'KV namespace not bound' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // Paginate through all keys (KV list returns max 1000 per call)
  const allEntries: unknown[] = [];
  let cursor: string | undefined;

  do {
    const list = await context.env.WAITLIST.list({ cursor });
    const entries = await Promise.all(
      list.keys.map(async (key) => {
        const value = await context.env.WAITLIST!.get(key.name);
        if (!value) return null;
        try {
          return JSON.parse(value);
        } catch {
          return { email: key.name, raw: value };
        }
      }),
    );
    allEntries.push(...entries.filter(Boolean));
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  return new Response(
    JSON.stringify({
      count: allEntries.length,
      entries: allEntries,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );
};
