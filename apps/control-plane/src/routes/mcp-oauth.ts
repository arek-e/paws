/**
 * MCP OAuth 2.1 + Streamable HTTP routes.
 *
 * Implements the full OAuth discovery + authorization flow per the MCP spec (2025-03-26):
 *   - RFC 9728: Protected Resource Metadata
 *   - RFC 8414: Authorization Server Metadata
 *   - RFC 7591: Dynamic Client Registration
 *   - OAuth 2.1 with PKCE (S256)
 *
 * Mounted on the control plane app — MCP endpoint at /mcp.
 */

import { Hono } from 'hono';
import { createLogger } from '@paws/logger';

import type { OAuthProvider } from '../auth/oauth.js';

const log = createLogger('mcp');

export interface McpOAuthDeps {
  oauth: OAuthProvider;
  /** The public URL of the control plane (e.g. "https://fleet.example.com") */
  issuerUrl: string;
}

export function createMcpOAuthRoutes(deps: McpOAuthDeps) {
  const { oauth, issuerUrl } = deps;
  const app = new Hono();

  // --- RFC 9728: Protected Resource Metadata ---
  app.get('/.well-known/oauth-protected-resource', (c) => {
    return c.json({
      resource: `${issuerUrl}/mcp`,
      authorization_servers: [issuerUrl],
      resource_name: 'paws MCP Server',
      resource_documentation: `${issuerUrl}/docs`,
    });
  });

  // Also serve at /mcp subpath for clients that use the path-based lookup
  app.get('/.well-known/oauth-protected-resource/mcp', (c) => {
    return c.json({
      resource: `${issuerUrl}/mcp`,
      authorization_servers: [issuerUrl],
      resource_name: 'paws MCP Server',
    });
  });

  // --- RFC 8414: Authorization Server Metadata ---
  app.get('/.well-known/oauth-authorization-server', (c) => {
    return c.json({
      issuer: issuerUrl,
      authorization_endpoint: `${issuerUrl}/oauth/authorize`,
      token_endpoint: `${issuerUrl}/oauth/token`,
      registration_endpoint: `${issuerUrl}/oauth/register`,
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
    });
  });

  // --- RFC 7591: Dynamic Client Registration ---
  app.post('/oauth/register', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) {
      return c.json({ error: 'invalid_request' }, 400);
    }

    const result = oauth.registerClient({
      redirect_uris: body.redirect_uris ?? [],
      client_name: body.client_name,
    });

    return c.json(
      {
        ...body,
        ...result,
      },
      201,
    );
  });

  // --- Authorization endpoint (GET: show login form, POST: handle login) ---
  app.get('/oauth/authorize', (c) => {
    const clientId = c.req.query('client_id') ?? '';
    const redirectUri = c.req.query('redirect_uri') ?? '';
    const state = c.req.query('state') ?? '';
    const codeChallenge = c.req.query('code_challenge') ?? '';
    const codeChallengeMethod = c.req.query('code_challenge_method') ?? '';
    const scope = c.req.query('scope') ?? '';

    // Validate
    if (!clientId || !redirectUri || !codeChallenge) {
      return c.json(
        { error: 'invalid_request', error_description: 'Missing required parameters' },
        400,
      );
    }

    if (codeChallengeMethod && codeChallengeMethod !== 'S256') {
      return c.json(
        {
          error: 'invalid_request',
          error_description: 'Only S256 code challenge method is supported',
        },
        400,
      );
    }

    const validation = oauth.validateClient(clientId, redirectUri);
    if (!validation.valid) {
      return c.json({ error: 'invalid_client' }, 400);
    }

    // Check if user is already logged in via paws_session cookie
    const cookies = c.req.header('cookie') ?? '';
    const sessionMatch = cookies.match(/paws_session=([^;]+)/);
    if (sessionMatch) {
      // Try to use existing session — skip login form
      // We need the passwordAuth from the oauth provider, but we can just
      // check if the session is valid and get the email
      // For now, show the login form anyway (simpler, more secure)
    }

    // Return a minimal login form
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>paws — Authorize</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0a; color: #e4e4e7; font-family: system-ui, -apple-system, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 32px; width: 380px; }
    .cat { text-align: center; color: #34d399; font-family: monospace; white-space: pre; font-size: 13px; margin-bottom: 16px; }
    h1 { font-size: 18px; font-weight: 600; text-align: center; margin-bottom: 4px; }
    .desc { text-align: center; color: #71717a; font-size: 13px; margin-bottom: 24px; }
    .client { text-align: center; color: #a1a1aa; font-size: 12px; margin-bottom: 20px; }
    .client strong { color: #d4d4d8; }
    label { display: block; font-size: 12px; color: #a1a1aa; margin-bottom: 4px; }
    input { width: 100%; padding: 8px 12px; background: #0a0a0a; border: 1px solid #3f3f46; border-radius: 6px; color: #e4e4e7; font-size: 14px; margin-bottom: 12px; }
    input:focus { outline: none; border-color: #34d399; }
    button { width: 100%; padding: 10px; background: #059669; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; }
    button:hover { background: #047857; }
    .error { background: #451a1a; border: 1px solid #7f1d1d; border-radius: 6px; padding: 8px 12px; color: #fca5a5; font-size: 13px; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="cat"> /\\_/\\
( o.o )
 > ^ <</div>
    <h1>Authorize</h1>
    <p class="desc">An application wants to access paws</p>
    ${validation.clientName ? `<p class="client"><strong>${validation.clientName}</strong> is requesting access</p>` : ''}
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${clientId}">
      <input type="hidden" name="redirect_uri" value="${redirectUri}">
      <input type="hidden" name="state" value="${state}">
      <input type="hidden" name="code_challenge" value="${codeChallenge}">
      <input type="hidden" name="scope" value="${scope}">
      <label>Email</label>
      <input type="email" name="email" required placeholder="admin@example.com" autofocus>
      <label>Password</label>
      <input type="password" name="password" required placeholder="Password">
      <button type="submit">Authorize</button>
    </form>
  </div>
</body>
</html>`;

    return c.html(html);
  });

  app.post('/oauth/authorize', async (c) => {
    const body = await c.req.parseBody();
    const clientId = String(body['client_id'] ?? '');
    const redirectUri = String(body['redirect_uri'] ?? '');
    const state = String(body['state'] ?? '');
    const codeChallenge = String(body['code_challenge'] ?? '');
    const scope = String(body['scope'] ?? '');
    const email = String(body['email'] ?? '');
    const password = String(body['password'] ?? '');

    // Validate client
    const validation = oauth.validateClient(clientId, redirectUri);
    if (!validation.valid) {
      return c.json({ error: 'invalid_client' }, 400);
    }

    // Authenticate user
    const token = await oauth.authenticate(email, password);
    if (!token) {
      // Re-show form with error
      return c.redirect(
        `/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256&scope=${encodeURIComponent(scope)}&error=invalid_credentials`,
        302,
      );
    }

    // Generate auth code
    const code = oauth.createAuthCode({
      clientId,
      codeChallenge,
      redirectUri,
      scopes: scope,
      userEmail: email,
    });

    log.info('Authorization code issued', { clientId, email });

    // Redirect back to client
    const url = new URL(redirectUri);
    url.searchParams.set('code', code);
    if (state) url.searchParams.set('state', state);
    return c.redirect(url.toString(), 302);
  });

  // --- Token endpoint ---
  app.post('/oauth/token', async (c) => {
    const body = await c.req.parseBody();
    const grantType = String(body['grant_type'] ?? '');

    if (grantType === 'authorization_code') {
      const code = String(body['code'] ?? '');
      const clientId = String(body['client_id'] ?? '');
      const codeVerifier = String(body['code_verifier'] ?? '');
      const redirectUri = String(body['redirect_uri'] ?? '');

      if (!code || !clientId || !codeVerifier || !redirectUri) {
        return c.json({ error: 'invalid_request' }, 400);
      }

      const tokens = await oauth.exchangeCode({ code, clientId, codeVerifier, redirectUri });
      if (!tokens) {
        return c.json({ error: 'invalid_grant' }, 400);
      }

      return c.json({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: 'Bearer',
        expires_in: tokens.expires_in,
      });
    }

    if (grantType === 'refresh_token') {
      const refreshToken = String(body['refresh_token'] ?? '');
      const clientId = String(body['client_id'] ?? '');

      if (!refreshToken || !clientId) {
        return c.json({ error: 'invalid_request' }, 400);
      }

      const result = oauth.refreshToken({ refreshToken, clientId });
      if (!result) {
        return c.json({ error: 'invalid_grant' }, 400);
      }

      return c.json({
        access_token: result.access_token,
        token_type: 'Bearer',
        expires_in: result.expires_in,
      });
    }

    return c.json({ error: 'unsupported_grant_type' }, 400);
  });

  return app;
}
