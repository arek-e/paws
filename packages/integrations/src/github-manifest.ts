import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * GitHub App Manifest Flow
 *
 * 1. Dashboard shows "Connect GitHub" button
 * 2. Button POSTs manifest to github.com/settings/apps/new
 * 3. User names the app and clicks "Create"
 * 4. GitHub redirects back with a temporary code
 * 5. We exchange the code for app credentials (app ID, private key, webhook secret)
 * 6. Credentials saved to disk, control plane reloads config
 */

export interface GitHubAppManifest {
  name?: string;
  url: string;
  hook_attributes: {
    url: string;
    active: boolean;
  };
  redirect_url: string;
  callback_urls?: string[];
  public: boolean;
  default_permissions: Record<string, string>;
  default_events: string[];
}

export interface GitHubAppCredentials {
  appId: string;
  appSlug: string;
  privateKey: string;
  webhookSecret: string;
  clientId: string;
  clientSecret: string;
  installationId?: number;
  htmlUrl: string;
  createdAt: string;
}

const CREDENTIALS_FILE = '/opt/paws/github-app.json';

/** Build the manifest JSON for the GitHub App creation flow */
export function buildManifest(baseUrl: string): GitHubAppManifest {
  return {
    url: 'https://github.com/arek-e/paws',
    hook_attributes: {
      url: `${baseUrl}/webhooks/github`,
      active: true,
    },
    redirect_url: `${baseUrl}/setup/github/callback`,
    public: false,
    default_permissions: {
      contents: 'read',
      issues: 'write',
      pull_requests: 'write',
      metadata: 'read',
    },
    default_events: ['issue_comment', 'pull_request'],
  };
}

/** Exchange the temporary code for full app credentials */
export async function exchangeManifestCode(code: string): Promise<GitHubAppCredentials> {
  const res = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub manifest exchange failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    id: number;
    slug: string;
    pem: string;
    webhook_secret: string;
    client_id: string;
    client_secret: string;
    html_url: string;
  };

  return {
    appId: String(data.id),
    appSlug: data.slug,
    privateKey: data.pem,
    webhookSecret: data.webhook_secret,
    clientId: data.client_id,
    clientSecret: data.client_secret,
    htmlUrl: data.html_url,
    createdAt: new Date().toISOString(),
  };
}

/** Save credentials to disk (atomic write) */
export function saveCredentials(creds: GitHubAppCredentials, filePath?: string): void {
  const path = filePath ?? CREDENTIALS_FILE;
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(creds, null, 2), { mode: 0o600 });
  const { renameSync } = require('node:fs');
  renameSync(tmpPath, path);
}

/** Load credentials from disk (returns null if not found) */
export function loadCredentials(filePath?: string): GitHubAppCredentials | null {
  const path = filePath ?? CREDENTIALS_FILE;
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as GitHubAppCredentials;
  } catch {
    return null;
  }
}
