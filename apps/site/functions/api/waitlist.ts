interface Env {
  WAITLIST?: KVNamespace;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://getpaws.dev',
  };

  try {
    const body = (await context.request.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase();

    if (!email || !email.includes('@') || !email.includes('.')) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Store in KV if available, otherwise just acknowledge
    if (context.env.WAITLIST) {
      await context.env.WAITLIST.put(
        `email:${email}`,
        JSON.stringify({
          email,
          joinedAt: new Date().toISOString(),
          source: 'landing-page',
        }),
      );
    }

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
