// KV binding "CONTACT_SUBMISSIONS" must be configured in Cloudflare Pages dashboard:
// Settings -> Functions -> KV namespace bindings -> Add binding
// Variable name: CONTACT_SUBMISSIONS
// KV namespace: create one called "paws-contact-submissions"

interface Env {
  CONTACT_SUBMISSIONS?: KVNamespace;
}

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': 'https://getpaws.dev',
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as {
      name?: string;
      email?: string;
      company?: string;
      message?: string;
    };

    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const company = body.company?.trim() || undefined;
    const message = body.message?.trim();

    if (!name) {
      return new Response(JSON.stringify({ error: 'Name is required' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const timestamp = new Date().toISOString();

    // If KV isn't bound yet, return success so the form doesn't break
    if (!context.env.CONTACT_SUBMISSIONS) {
      return new Response(
        JSON.stringify({ ok: true, message: 'Message received' }),
        { status: 200, headers: corsHeaders }
      );
    }

    const key = `${timestamp}_${email}`;
    await context.env.CONTACT_SUBMISSIONS.put(
      key,
      JSON.stringify({
        name,
        email,
        company,
        message,
        submittedAt: timestamp,
        source: context.request.headers.get('referer') || 'direct',
      })
    );

    return new Response(
      JSON.stringify({ ok: true, message: 'Message received' }),
      { status: 200, headers: corsHeaders }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: corsHeaders }
    );
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
