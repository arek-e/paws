/**
 * OAuth 2.1 provider for MCP authorization.
 *
 * Implements the OAuth endpoints needed for MCP clients (Claude Code, Cursor)
 * to authenticate via the paws dashboard login. Uses PKCE (S256) and dynamic
 * client registration per the MCP spec (2025-03-26).
 *
 * Backed by SQLite — reuses the existing paws database for clients, codes, and tokens.
 */

import { randomUUID } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import { createLogger } from '@paws/logger';

import type { PawsDatabase } from '../db/index.js';
import { oauthClients, oauthAuthCodes, oauthTokens } from '../db/schema.js';
import type { PasswordAuth } from './password.js';

const log = createLogger('oauth');

const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface OAuthProvider {
  /** RFC 7591 — Dynamic Client Registration */
  registerClient(body: { redirect_uris: string[]; client_name?: string }): {
    client_id: string;
    client_secret: string;
    client_id_issued_at: number;
  };

  /** Validate client_id + redirect_uri */
  validateClient(clientId: string, redirectUri: string): { valid: boolean; clientName?: string };

  /** Generate authorization code after user authenticates */
  createAuthCode(opts: {
    clientId: string;
    codeChallenge: string;
    redirectUri: string;
    scopes: string;
    userEmail: string;
  }): string;

  /** Exchange authorization code for tokens (with PKCE verification) */
  exchangeCode(opts: {
    code: string;
    clientId: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<{ access_token: string; refresh_token: string; expires_in: number } | null>;

  /** Exchange refresh token for new access token */
  refreshToken(opts: {
    refreshToken: string;
    clientId: string;
  }): { access_token: string; expires_in: number } | null;

  /** Verify an access token — returns user email or null */
  verifyToken(token: string): string | null;

  /** Authenticate user via password auth */
  authenticate: PasswordAuth['login'];
}

/** SHA-256 hash for PKCE S256 verification */
async function sha256base64url(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  // Base64url encode (no padding)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function createOAuthProvider(db: PawsDatabase, passwordAuth: PasswordAuth): OAuthProvider {
  // Clean up expired codes/tokens periodically
  function cleanup() {
    const now = Date.now();
    db.delete(oauthAuthCodes).where(eq(oauthAuthCodes.expiresAt, 0)).run(); // placeholder — real cleanup below
    // Delete all expired entries (can't use < with eq, so use raw)
    try {
      (db as unknown as { $client: { exec: (sql: string) => void } }).$client.exec(
        `DELETE FROM oauth_auth_codes WHERE expires_at < ${now};
         DELETE FROM oauth_tokens WHERE expires_at < ${now};`,
      );
    } catch {
      // Ignore cleanup failures
    }
  }

  // Run cleanup on creation and every 10 minutes
  cleanup();
  const cleanupTimer = setInterval(cleanup, 10 * 60 * 1000);
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

  return {
    registerClient(body) {
      const clientId = randomUUID();
      const clientSecret = randomUUID();
      const now = Math.floor(Date.now() / 1000);

      db.insert(oauthClients)
        .values({
          clientId,
          clientSecret,
          redirectUris: JSON.stringify(body.redirect_uris ?? []),
          clientName: body.client_name ?? null,
          issuedAt: now,
        })
        .run();

      log.info('Client registered', { clientId, clientName: body.client_name });

      return {
        client_id: clientId,
        client_secret: clientSecret,
        client_id_issued_at: now,
        ...body,
      };
    },

    validateClient(clientId, redirectUri) {
      const client = db
        .select()
        .from(oauthClients)
        .where(eq(oauthClients.clientId, clientId))
        .get();

      if (!client) return { valid: false };

      const uris = JSON.parse(client.redirectUris) as string[];
      if (uris.length > 0 && !uris.includes(redirectUri)) {
        return { valid: false };
      }

      return { valid: true, clientName: client.clientName ?? undefined };
    },

    createAuthCode(opts) {
      const code = randomUUID();
      const expiresAt = Date.now() + AUTH_CODE_TTL_MS;

      db.insert(oauthAuthCodes)
        .values({
          code,
          clientId: opts.clientId,
          codeChallenge: opts.codeChallenge,
          redirectUri: opts.redirectUri,
          scopes: opts.scopes,
          userEmail: opts.userEmail,
          expiresAt,
        })
        .run();

      return code;
    },

    async exchangeCode(opts) {
      const authCode = db
        .select()
        .from(oauthAuthCodes)
        .where(eq(oauthAuthCodes.code, opts.code))
        .get();

      if (!authCode) return null;

      // Delete the code (one-time use)
      db.delete(oauthAuthCodes).where(eq(oauthAuthCodes.code, opts.code)).run();

      // Check expiry
      if (Date.now() > authCode.expiresAt) return null;

      // Verify client
      if (authCode.clientId !== opts.clientId) return null;

      // Verify redirect URI
      if (authCode.redirectUri !== opts.redirectUri) return null;

      // Verify PKCE (S256)
      const computedChallenge = await sha256base64url(opts.codeVerifier);
      if (computedChallenge !== authCode.codeChallenge) return null;

      // Issue tokens
      const accessToken = randomUUID();
      const refreshToken = randomUUID();
      const expiresIn = Math.floor(ACCESS_TOKEN_TTL_MS / 1000);

      db.insert(oauthTokens)
        .values({
          token: accessToken,
          tokenType: 'access',
          clientId: opts.clientId,
          userEmail: authCode.userEmail,
          scopes: authCode.scopes,
          expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
        })
        .run();

      db.insert(oauthTokens)
        .values({
          token: refreshToken,
          tokenType: 'refresh',
          clientId: opts.clientId,
          userEmail: authCode.userEmail,
          scopes: authCode.scopes,
          expiresAt: Date.now() + REFRESH_TOKEN_TTL_MS,
        })
        .run();

      log.info('Tokens issued', { clientId: opts.clientId, email: authCode.userEmail });

      return { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn };
    },

    refreshToken(opts) {
      const existing = db
        .select()
        .from(oauthTokens)
        .where(eq(oauthTokens.token, opts.refreshToken))
        .get();

      if (!existing) return null;
      if (existing.tokenType !== 'refresh') return null;
      if (existing.clientId !== opts.clientId) return null;
      if (Date.now() > existing.expiresAt) {
        db.delete(oauthTokens).where(eq(oauthTokens.token, opts.refreshToken)).run();
        return null;
      }

      // Issue new access token
      const accessToken = randomUUID();
      const expiresIn = Math.floor(ACCESS_TOKEN_TTL_MS / 1000);

      db.insert(oauthTokens)
        .values({
          token: accessToken,
          tokenType: 'access',
          clientId: opts.clientId,
          userEmail: existing.userEmail,
          scopes: existing.scopes,
          expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
        })
        .run();

      return { access_token: accessToken, expires_in: expiresIn };
    },

    verifyToken(token) {
      const row = db.select().from(oauthTokens).where(eq(oauthTokens.token, token)).get();
      if (!row) return null;
      if (row.tokenType !== 'access') return null;
      if (Date.now() > row.expiresAt) {
        db.delete(oauthTokens).where(eq(oauthTokens.token, token)).run();
        return null;
      }
      return row.userEmail;
    },

    authenticate: passwordAuth.login.bind(passwordAuth),
  };
}
