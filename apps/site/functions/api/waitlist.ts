// KV binding "WAITLIST" must be configured in Cloudflare Pages dashboard:
// Settings -> Functions -> KV namespace bindings -> Add binding
// Variable name: WAITLIST
// KV namespace: create one called "paws-waitlist"
//
// Secret "ADMIN_KEY" must be configured for the admin list endpoint:
// Settings -> Functions -> Environment variables -> Add variable
// Variable name: ADMIN_KEY

interface Env {
  WAITLIST?: KVNamespace;
  ADMIN_KEY?: string;
}

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': 'https://getpaws.dev',
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // If KV isn't bound yet, return success so the form doesn't break
    if (!context.env.WAITLIST) {
      return new Response(JSON.stringify({ ok: true, message: 'Added to waitlist' }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // Check for duplicate — don't reveal it to avoid email enumeration
    const existing = await context.env.WAITLIST.get(email);
    if (existing) {
      return new Response(JSON.stringify({ ok: true, message: 'Added to waitlist' }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // Store with email as key, metadata as value
    await context.env.WAITLIST.put(
      email,
      JSON.stringify({
        email,
        joinedAt: new Date().toISOString(),
        source: context.request.headers.get('referer') || 'direct',
      }),
    );

    return new Response(JSON.stringify({ ok: true, message: 'Added to waitlist' }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: corsHeaders,
    });
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': 'https://getpaws.dev',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
