/**
 * Credential storage and token refresh for OAuth login.
 *
 * Credentials are stored at ~/.paws/credentials.json.
 * Token refresh is automatic — if the access token is expired, the refresh
 * token is used to obtain a new one before returning.
 */

import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface StoredCredentials {
  url: string;
  clientId: string;
  accessToken: string;
  refreshToken: string;
  /** Unix timestamp in milliseconds */
  expiresAt: number;
}

const PAWS_DIR = join(homedir(), '.paws');
const CREDENTIALS_PATH = join(PAWS_DIR, 'credentials.json');

/** Buffer before expiry to trigger refresh (5 minutes) */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

function ensureDir(): void {
  if (!existsSync(PAWS_DIR)) {
    mkdirSync(PAWS_DIR, { mode: 0o700, recursive: true });
  }
}

export function saveCredentials(creds: StoredCredentials): void {
  ensureDir();
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2) + '\n', {
    mode: 0o600,
  });
}

export function loadCredentials(): StoredCredentials | null {
  try {
    const raw = readFileSync(CREDENTIALS_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as StoredCredentials;
    if (!parsed.url || !parsed.accessToken || !parsed.refreshToken) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearCredentials(): boolean {
  try {
    if (existsSync(CREDENTIALS_PATH)) {
      unlinkSync(CREDENTIALS_PATH);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Load credentials with automatic token refresh.
 *
 * Returns null if no credentials exist or refresh fails.
 */
export async function loadAndRefreshCredentials(): Promise<StoredCredentials | null> {
  const creds = loadCredentials();
  if (!creds) return null;

  // If token is still valid (with buffer), return as-is
  if (Date.now() < creds.expiresAt - REFRESH_BUFFER_MS) {
    return creds;
  }

  // Token expired or about to expire — try refresh
  try {
    const response = await fetch(`${creds.url}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: creds.refreshToken,
        client_id: creds.clientId,
      }).toString(),
    });

    if (!response.ok) {
      // Refresh failed — credentials are stale
      return null;
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    const updated: StoredCredentials = {
      ...creds,
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    saveCredentials(updated);
    return updated;
  } catch {
    // Network error during refresh — return existing creds if not fully expired
    if (Date.now() < creds.expiresAt) {
      return creds;
    }
    return null;
  }
}
