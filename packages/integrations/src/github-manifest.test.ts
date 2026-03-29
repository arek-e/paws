import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  buildManifest,
  exchangeManifestCode,
  saveCredentials,
  loadCredentials,
  type GitHubAppCredentials,
} from './github-manifest.js';

// ---------------------------------------------------------------------------
// buildManifest
// ---------------------------------------------------------------------------

describe('buildManifest', () => {
  it('builds manifest with correct webhook URL', () => {
    const manifest = buildManifest('https://paws.example.com');
    expect(manifest.hook_attributes.url).toBe('https://paws.example.com/webhooks/github');
    expect(manifest.hook_attributes.active).toBe(true);
  });

  it('builds manifest with correct redirect URL', () => {
    const manifest = buildManifest('https://paws.example.com');
    expect(manifest.redirect_url).toBe('https://paws.example.com/setup/github/callback');
  });

  it('sets public to false', () => {
    const manifest = buildManifest('https://paws.example.com');
    expect(manifest.public).toBe(false);
  });

  it('includes required permissions', () => {
    const manifest = buildManifest('https://paws.example.com');
    expect(manifest.default_permissions).toEqual({
      contents: 'read',
      issues: 'write',
      pull_requests: 'write',
      metadata: 'read',
    });
  });

  it('includes required events', () => {
    const manifest = buildManifest('https://paws.example.com');
    expect(manifest.default_events).toEqual(['issue_comment', 'pull_request']);
  });

  it('includes repo URL', () => {
    const manifest = buildManifest('https://paws.example.com');
    expect(manifest.url).toBe('https://github.com/arek-e/paws');
  });

  it('handles baseUrl with trailing slash', () => {
    const manifest = buildManifest('https://paws.example.com/');
    // The function doesn't strip trailing slashes, but URLs are still valid
    expect(manifest.hook_attributes.url).toContain('/webhooks/github');
  });
});

// ---------------------------------------------------------------------------
// exchangeManifestCode
// ---------------------------------------------------------------------------

describe('exchangeManifestCode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exchanges code for credentials', async () => {
    const mockData = {
      id: 42,
      slug: 'paws-test',
      pem: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----',
      webhook_secret: 'whsec_abc123',
      client_id: 'Iv1.abc123',
      client_secret: 'cs_secret',
      html_url: 'https://github.com/apps/paws-test',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockData),
    }) as typeof fetch;

    const creds = await exchangeManifestCode('temp_code_xyz');

    expect(creds.appId).toBe('42');
    expect(creds.appSlug).toBe('paws-test');
    expect(creds.privateKey).toContain('RSA PRIVATE KEY');
    expect(creds.webhookSecret).toBe('whsec_abc123');
    expect(creds.clientId).toBe('Iv1.abc123');
    expect(creds.clientSecret).toBe('cs_secret');
    expect(creds.htmlUrl).toBe('https://github.com/apps/paws-test');
    expect(creds.createdAt).toBeTruthy();

    // Verify fetch was called correctly
    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(fetchCall[0]).toBe('https://api.github.com/app-manifests/temp_code_xyz/conversions');
    expect(fetchCall[1]).toMatchObject({ method: 'POST' });
  });

  it('throws on non-OK response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not Found'),
    }) as typeof fetch;

    await expect(exchangeManifestCode('bad_code')).rejects.toThrow(
      'GitHub manifest exchange failed: 404 Not Found',
    );
  });
});

// ---------------------------------------------------------------------------
// saveCredentials / loadCredentials
// ---------------------------------------------------------------------------

describe('saveCredentials / loadCredentials', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gh-manifest-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const testCreds: GitHubAppCredentials = {
    appId: '42',
    appSlug: 'paws-test',
    privateKey: 'pem-data',
    webhookSecret: 'whsec_abc',
    clientId: 'Iv1.abc',
    clientSecret: 'cs_secret',
    htmlUrl: 'https://github.com/apps/paws-test',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('saves and loads credentials', () => {
    const filePath = join(dir, 'creds.json');
    saveCredentials(testCreds, filePath);
    const loaded = loadCredentials(filePath);
    expect(loaded).toEqual(testCreds);
  });

  it('creates parent directories if needed', () => {
    const filePath = join(dir, 'nested', 'deep', 'creds.json');
    saveCredentials(testCreds, filePath);
    expect(existsSync(filePath)).toBe(true);
    const loaded = loadCredentials(filePath);
    expect(loaded).toEqual(testCreds);
  });

  it('returns null for non-existent file', () => {
    const loaded = loadCredentials(join(dir, 'nonexistent.json'));
    expect(loaded).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    const filePath = join(dir, 'corrupt.json');
    writeFileSync(filePath, '{invalid json!!!');
    const loaded = loadCredentials(filePath);
    expect(loaded).toBeNull();
  });

  it('overwrites existing credentials', () => {
    const filePath = join(dir, 'creds.json');
    saveCredentials(testCreds, filePath);

    const updated = { ...testCreds, appId: '99' };
    saveCredentials(updated, filePath);

    const loaded = loadCredentials(filePath);
    expect(loaded!.appId).toBe('99');
  });

  it('includes optional installationId', () => {
    const filePath = join(dir, 'creds.json');
    const credsWithInstall = { ...testCreds, installationId: 12345 };
    saveCredentials(credsWithInstall, filePath);
    const loaded = loadCredentials(filePath);
    expect(loaded!.installationId).toBe(12345);
  });
});
