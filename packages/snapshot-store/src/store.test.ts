import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import { createSnapshotStore } from './store.js';
import { SnapshotStoreErrorCode } from './errors.js';
import type { SnapshotManifest } from './types.js';

// ---------------------------------------------------------------------------
// Mock S3Client
// ---------------------------------------------------------------------------

interface MockResponse {
  body?: string | Buffer;
  statusCode?: number;
  error?: Error;
  contents?: Array<{ Key: string }>;
}

type CommandMatcher = (command: unknown) => MockResponse | undefined;

function createMockS3Client(matchers: CommandMatcher[]) {
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];

  return {
    calls,
    send: async (command: unknown) => {
      const cmd = command as { constructor: { name: string }; input: Record<string, unknown> };
      const name = cmd.constructor.name;
      const input = cmd.input;
      calls.push({ name, input });

      for (const matcher of matchers) {
        const result = matcher(command);
        if (result) {
          if (result.error) throw result.error;

          // ListObjectsV2Command
          if (name === 'ListObjectsV2Command') {
            return { Contents: result.contents ?? [] };
          }

          // GetObjectCommand — return body as SDK stream-like object
          if (name === 'GetObjectCommand') {
            const bodyStr = result.body ?? '';
            const readable = Readable.from([
              typeof bodyStr === 'string' ? Buffer.from(bodyStr) : bodyStr,
            ]);
            return {
              Body: Object.assign(readable, {
                transformToString: async () =>
                  typeof bodyStr === 'string' ? bodyStr : bodyStr.toString(),
              }),
            };
          }

          // PutObjectCommand / Upload — success
          return {};
        }
      }

      // Default: NoSuchKey for GET, success for PUT
      if (name === 'GetObjectCommand') {
        const err = new Error('NoSuchKey');
        err.name = 'NoSuchKey';
        throw err;
      }
      return {};
    },
  };
}

function keyMatcher(targetKey: string, response: MockResponse): CommandMatcher {
  return (command: unknown) => {
    const cmd = command as { input?: { Key?: string; Prefix?: string } };
    if (cmd.input?.Key === targetKey || cmd.input?.Prefix === targetKey) {
      return response;
    }
    return undefined;
  };
}

function commandNameMatcher(targetName: string, response: MockResponse): CommandMatcher {
  return (command: unknown) => {
    const cmd = command as { constructor: { name: string } };
    if (cmd.constructor.name === targetName) {
      return response;
    }
    return undefined;
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_MANIFEST: SnapshotManifest = {
  id: 'agent-latest',
  version: 3,
  createdAt: '2026-03-27T00:00:00.000Z',
  files: [
    {
      name: 'disk.ext4',
      size: 4_000_000_000,
      sha256: 'abc123',
      key: 'snapshots/agent-latest/disk.ext4',
    },
    {
      name: 'memory.snap',
      size: 4_000_000_000,
      sha256: 'def456',
      key: 'snapshots/agent-latest/memory.snap',
    },
  ],
  previousVersion: 2,
};

function makeStore(matchers: CommandMatcher[]) {
  const mock = createMockS3Client(matchers);
  const store = createSnapshotStore({
    endpoint: 'https://r2.example.com',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    bucket: 'test-bucket',
    s3Client: mock as never,
  });
  return { store, mock };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createSnapshotStore', () => {
  describe('getManifest', () => {
    it('returns parsed manifest on success', async () => {
      const { store } = makeStore([
        keyMatcher('snapshots/agent-latest/manifest.json', {
          body: JSON.stringify(TEST_MANIFEST),
        }),
      ]);

      const result = await store.getManifest('agent-latest');
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual(TEST_MANIFEST);
    });

    it('returns MANIFEST_NOT_FOUND for missing key', async () => {
      const { store } = makeStore([]); // No matchers → default NoSuchKey

      const result = await store.getManifest('nonexistent');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(SnapshotStoreErrorCode.MANIFEST_NOT_FOUND);
    });

    it('returns DOWNLOAD_FAILED for malformed JSON', async () => {
      const { store } = makeStore([
        keyMatcher('snapshots/bad/manifest.json', {
          body: '{ not valid json',
        }),
      ]);

      const result = await store.getManifest('bad');
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(SnapshotStoreErrorCode.DOWNLOAD_FAILED);
    });
  });

  describe('putManifest', () => {
    it('writes current and versioned manifest', async () => {
      const { store, mock } = makeStore([commandNameMatcher('PutObjectCommand', {})]);

      const result = await store.putManifest(TEST_MANIFEST);
      expect(result.isOk()).toBe(true);

      // Should have sent two PutObjectCommands
      const puts = mock.calls.filter((c) => c.name === 'PutObjectCommand');
      expect(puts).toHaveLength(2);

      const keys = puts.map((p) => p.input.Key);
      expect(keys).toContain('snapshots/agent-latest/manifest.json');
      expect(keys).toContain('snapshots/agent-latest/manifests/v3.json');
    });

    it('returns UPLOAD_FAILED on S3 error', async () => {
      const { store } = makeStore([
        commandNameMatcher('PutObjectCommand', {
          error: new Error('S3 write failed'),
        }),
      ]);

      const result = await store.putManifest(TEST_MANIFEST);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(SnapshotStoreErrorCode.UPLOAD_FAILED);
    });
  });

  describe('uploadFile', () => {
    it('uploads a small file and returns sha256', async () => {
      // We need a real file for createReadStream. Use a temp file.
      const { writeFileSync, mkdtempSync, unlinkSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');
      const { createHash } = await import('node:crypto');

      const dir = mkdtempSync(join(tmpdir(), 'snap-test-'));
      const filePath = join(dir, 'test.bin');
      const content = Buffer.from('hello snapshot world');
      writeFileSync(filePath, content);

      const expectedHash = createHash('sha256').update(content).digest('hex');

      const { store } = makeStore([commandNameMatcher('PutObjectCommand', {})]);

      const result = await store.uploadFile('snapshots/test/disk.ext4', filePath);
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(expectedHash);

      unlinkSync(filePath);
    });

    it('returns UPLOAD_FAILED on error', async () => {
      const { store } = makeStore([
        commandNameMatcher('PutObjectCommand', {
          error: new Error('upload boom'),
        }),
      ]);

      const { writeFileSync, mkdtempSync, unlinkSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');

      const dir = mkdtempSync(join(tmpdir(), 'snap-test-'));
      const filePath = join(dir, 'test.bin');
      writeFileSync(filePath, 'data');

      const result = await store.uploadFile('key', filePath);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(SnapshotStoreErrorCode.UPLOAD_FAILED);

      unlinkSync(filePath);
    });
  });

  describe('downloadFile', () => {
    it('downloads file and returns sha256', async () => {
      const { mkdtempSync, readFileSync, unlinkSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');
      const { createHash } = await import('node:crypto');

      const content = Buffer.from('downloaded snapshot data');
      const expectedHash = createHash('sha256').update(content).digest('hex');

      const { store } = makeStore([keyMatcher('snapshots/test/disk.ext4', { body: content })]);

      const dir = mkdtempSync(join(tmpdir(), 'snap-dl-'));
      const destPath = join(dir, 'disk.ext4');

      const result = await store.downloadFile('snapshots/test/disk.ext4', destPath);
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(expectedHash);
      expect(readFileSync(destPath).toString()).toBe('downloaded snapshot data');

      unlinkSync(destPath);
    });

    it('returns DOWNLOAD_FAILED for missing key', async () => {
      const { mkdtempSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');

      const { store } = makeStore([]); // Default NoSuchKey

      const dir = mkdtempSync(join(tmpdir(), 'snap-dl-'));
      const destPath = join(dir, 'missing.ext4');

      const result = await store.downloadFile('snapshots/missing/disk.ext4', destPath);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(SnapshotStoreErrorCode.DOWNLOAD_FAILED);
    });

    it('returns CHECKSUM_MISMATCH and deletes file on bad checksum', async () => {
      const { mkdtempSync, existsSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');

      const content = Buffer.from('some data');

      const { store } = makeStore([keyMatcher('snapshots/test/disk.ext4', { body: content })]);

      const dir = mkdtempSync(join(tmpdir(), 'snap-dl-'));
      const destPath = join(dir, 'disk.ext4');

      const result = await store.downloadFile(
        'snapshots/test/disk.ext4',
        destPath,
        'wrong-checksum-value',
      );
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe(SnapshotStoreErrorCode.CHECKSUM_MISMATCH);
      // File should be deleted
      expect(existsSync(destPath)).toBe(false);
    });
  });

  describe('listVersions', () => {
    it('returns sorted manifests', async () => {
      const v1: SnapshotManifest = { ...TEST_MANIFEST, version: 1 };
      const v2: SnapshotManifest = { ...TEST_MANIFEST, version: 2 };

      const { store } = makeStore([
        keyMatcher('snapshots/agent-latest/manifests/', {
          contents: [
            { Key: 'snapshots/agent-latest/manifests/v2.json' },
            { Key: 'snapshots/agent-latest/manifests/v1.json' },
          ],
        }),
        keyMatcher('snapshots/agent-latest/manifests/v2.json', {
          body: JSON.stringify(v2),
        }),
        keyMatcher('snapshots/agent-latest/manifests/v1.json', {
          body: JSON.stringify(v1),
        }),
      ]);

      const result = await store.listVersions('agent-latest');
      expect(result.isOk()).toBe(true);

      const manifests = result._unsafeUnwrap();
      expect(manifests).toHaveLength(2);
      expect(manifests[0]!.version).toBe(1);
      expect(manifests[1]!.version).toBe(2);
    });

    it('returns empty array for empty bucket', async () => {
      const { store } = makeStore([keyMatcher('snapshots/empty/manifests/', { contents: [] })]);

      const result = await store.listVersions('empty');
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual([]);
    });
  });
});
