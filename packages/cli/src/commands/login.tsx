/**
 * `paws login` -- authenticate via OAuth and save credentials locally.
 *
 * Flow:
 * 1. Generate PKCE code_verifier + code_challenge
 * 2. Register as OAuth client via POST /oauth/register
 * 3. Start a temporary local HTTP server for the callback
 * 4. Open browser to authorization URL
 * 5. Receive callback with authorization code
 * 6. Exchange code for tokens via POST /oauth/token
 * 7. Save credentials to ~/.paws/credentials.json
 */

import { useState, useEffect } from 'react';
import { render, Box, Text } from 'ink';
import { Spinner as InkSpinner } from '@inkjs/ui';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { exec } from 'node:child_process';
import type { ParsedArgs } from '../config.js';
import { saveCredentials } from '../auth.js';
import { printError, printInfo, printSuccess } from '../output.js';

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

function waitForCallback(port: number): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state') ?? '';
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(errorPage(error));
        server.close();
        reject(new Error(`Authorization failed: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(errorPage('No authorization code received'));
        server.close();
        reject(new Error('No authorization code in callback'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(successPage());
      server.close();
      resolve({ code, state });
    });

    server.listen(port, '127.0.0.1');

    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Login timed out -- no callback received within 2 minutes'));
    }, 120_000);
    timeout.unref();

    server.on('close', () => clearTimeout(timeout));
  });
}

function successPage(): string {
  return `<!DOCTYPE html>
<html><head><title>paws -- Logged in</title>
<style>body{background:#0a0a0a;color:#e4e4e7;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{text-align:center;background:#18181b;border:1px solid #27272a;border-radius:12px;padding:32px}
.cat{color:#34d399;font-family:monospace;white-space:pre;font-size:13px;margin-bottom:16px}
h1{font-size:18px;color:#34d399;margin-bottom:8px}p{color:#a1a1aa;font-size:14px}</style>
</head><body><div class="card">
<div class="cat"> /\\_/\\
( o.o )
 > ^ <</div>
<h1>Logged in!</h1>
<p>You can close this tab and return to the terminal.</p>
</div></body></html>`;
}

function errorPage(error: string): string {
  return `<!DOCTYPE html>
<html><head><title>paws -- Login failed</title>
<style>body{background:#0a0a0a;color:#e4e4e7;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{text-align:center;background:#18181b;border:1px solid #27272a;border-radius:12px;padding:32px}
h1{font-size:18px;color:#f87171;margin-bottom:8px}p{color:#a1a1aa;font-size:14px}</style>
</head><body><div class="card">
<h1>Login failed</h1>
<p>${error}</p>
</div></body></html>`;
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('Could not find free port')));
      }
    });
    srv.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Ink component for interactive login
// ---------------------------------------------------------------------------

type LoginPhase = 'registering' | 'browser' | 'waiting' | 'exchanging' | 'done' | 'error';

interface LoginViewProps {
  baseUrl: string;
  onDone: (code: number) => void;
}

function LoginView({ baseUrl, onDone }: LoginViewProps) {
  const [phase, setPhase] = useState<LoginPhase>('registering');
  const [authUrlStr, setAuthUrlStr] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        // Step 1: PKCE
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = generateCodeChallenge(codeVerifier);
        const state = randomBytes(16).toString('base64url');

        // Step 2: Find free port
        const port = await findFreePort();
        const redirectUri = `http://localhost:${port}/callback`;

        // Step 3: Register OAuth client
        const regResponse = await fetch(`${baseUrl}/oauth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            redirect_uris: [redirectUri],
            client_name: 'paws CLI',
          }),
        });

        if (!regResponse.ok) {
          const body = await regResponse.text();
          throw new Error(`Failed to register OAuth client: ${regResponse.status} ${body}`);
        }

        const registration = (await regResponse.json()) as {
          client_id: string;
          client_secret: string;
        };

        if (cancelled) return;

        // Step 4: Start callback server
        const callbackPromise = waitForCallback(port);

        // Step 5: Open browser
        const authUrl = new URL(`${baseUrl}/oauth/authorize`);
        authUrl.searchParams.set('client_id', registration.client_id);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('state', state);

        setAuthUrlStr(authUrl.toString());
        setPhase('browser');
        openBrowser(authUrl.toString());

        if (cancelled) return;
        setPhase('waiting');

        // Step 6: Wait for callback
        const callback = await callbackPromise;

        if (callback.state !== state) {
          throw new Error('State mismatch -- possible CSRF attack. Aborting.');
        }

        if (cancelled) return;
        setPhase('exchanging');

        // Step 7: Exchange code for tokens
        const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: callback.code,
            client_id: registration.client_id,
            code_verifier: codeVerifier,
            redirect_uri: redirectUri,
          }).toString(),
        });

        if (!tokenResponse.ok) {
          const body = await tokenResponse.text();
          throw new Error(`Token exchange failed: ${tokenResponse.status} ${body}`);
        }

        const tokens = (await tokenResponse.json()) as {
          access_token: string;
          refresh_token: string;
          expires_in: number;
        };

        // Step 8: Save credentials
        saveCredentials({
          url: baseUrl,
          clientId: registration.client_id,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Date.now() + tokens.expires_in * 1000,
        });

        if (cancelled) return;
        setPhase('done');
        onDone(0);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
        onDone(1);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  return (
    <Box flexDirection="column">
      {phase === 'registering' && <InkSpinner label="Registering OAuth client..." />}

      {phase === 'browser' && (
        <Box flexDirection="column">
          <Text color="green">{'\u2713'} OAuth client registered</Text>
          <Text>Opening browser...</Text>
          {authUrlStr && <Text dimColor>If the browser does not open, visit: {authUrlStr}</Text>}
        </Box>
      )}

      {phase === 'waiting' && (
        <Box flexDirection="column">
          <Text color="green">{'\u2713'} OAuth client registered</Text>
          <Text color="green">{'\u2713'} Browser opened</Text>
          <InkSpinner label="Waiting for authorization..." />
        </Box>
      )}

      {phase === 'exchanging' && (
        <Box flexDirection="column">
          <Text color="green">{'\u2713'} OAuth client registered</Text>
          <Text color="green">{'\u2713'} Browser opened</Text>
          <Text color="green">{'\u2713'} Authorization received</Text>
          <InkSpinner label="Exchanging code for tokens..." />
        </Box>
      )}

      {phase === 'done' && (
        <Box flexDirection="column">
          <Text color="green">{'\u2713'} OAuth client registered</Text>
          <Text color="green">{'\u2713'} Browser opened</Text>
          <Text color="green">{'\u2713'} Authorization received</Text>
          <Text color="green">
            {'\u2713'} Logged in to {baseUrl}
          </Text>
          <Text dimColor>Credentials saved to ~/.paws/credentials.json</Text>
        </Box>
      )}

      {phase === 'error' && (
        <Box flexDirection="column">
          <Text color="red">
            {'\u2717'} {error}
          </Text>
        </Box>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Command entrypoint
// ---------------------------------------------------------------------------

export async function loginCommand(
  _client: unknown,
  args: ParsedArgs,
  _pretty: boolean,
): Promise<number> {
  const url = args.flags['url'] ?? process.env['PAWS_URL'];

  if (!url) {
    printError('Missing server URL. Use: paws login --url <server-url>');
    return 1;
  }

  const baseUrl = url.replace(/\/+$/, '');
  const isTTY = process.stdout.isTTY === true;

  if (!isTTY) {
    // Non-interactive fallback (same as original)
    return loginPlain(baseUrl);
  }

  return new Promise<number>((resolve) => {
    const { unmount } = render(
      <LoginView
        baseUrl={baseUrl}
        onDone={(code) => {
          setTimeout(() => {
            unmount();
            resolve(code);
          }, 100);
        }}
      />,
    );
  });
}

async function loginPlain(baseUrl: string): Promise<number> {
  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = randomBytes(16).toString('base64url');

    const port = await findFreePort();
    const redirectUri = `http://localhost:${port}/callback`;

    printInfo('Registering OAuth client...');
    const regResponse = await fetch(`${baseUrl}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: [redirectUri],
        client_name: 'paws CLI',
      }),
    });

    if (!regResponse.ok) {
      const body = await regResponse.text();
      printError(`Failed to register OAuth client: ${regResponse.status} ${body}`);
      return 1;
    }

    const registration = (await regResponse.json()) as {
      client_id: string;
      client_secret: string;
    };

    const callbackPromise = waitForCallback(port);

    const authUrl = new URL(`${baseUrl}/oauth/authorize`);
    authUrl.searchParams.set('client_id', registration.client_id);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    printInfo('Opening browser for login...');
    printInfo(`If the browser does not open, visit: ${authUrl.toString()}`);
    openBrowser(authUrl.toString());

    printInfo('Waiting for authorization...');
    const callback = await callbackPromise;

    if (callback.state !== state) {
      printError('State mismatch -- possible CSRF attack. Aborting.');
      return 1;
    }

    printInfo('Exchanging authorization code for tokens...');
    const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: callback.code,
        client_id: registration.client_id,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      printError(`Token exchange failed: ${tokenResponse.status} ${body}`);
      return 1;
    }

    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    saveCredentials({
      url: baseUrl,
      clientId: registration.client_id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });

    printSuccess(`Logged in to ${baseUrl}`);
    printInfo('Credentials saved to ~/.paws/credentials.json');
    return 0;
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
