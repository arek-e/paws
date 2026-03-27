import { mkdir, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultAsync } from 'neverthrow';

import { SnapshotStoreError, SnapshotStoreErrorCode } from '@paws/snapshot-store';
import type { SnapshotStore } from '@paws/snapshot-store';
import type { SnapshotManifest } from '@paws/snapshot-store';

import { createSyncLoop } from './sync-loop.js';
import type { SyncConfig, SyncDeps } from './sync-loop.js';

function makeManifest(version: number): SnapshotManifest {
  return {
    id: 'agent-latest',
    version,
    createdAt: new Date().toISOString(),
    files: [
      {
        name: 'disk.ext4',
        size: 1024,
        sha256: 'abc123',
        key: `snapshots/agent-latest/v${version}/disk.ext4`,
      },
      {
        name: 'memory.snap',
        size: 2048,
        sha256: 'def456',
        key: `snapshots/agent-latest/v${version}/memory.snap`,
      },
    ],
  };
}

function createMockStore(manifest: SnapshotManifest | null = null): SnapshotStore {
  return {
    getManifest: vi.fn((_id: string) => {
      if (manifest) {
        return ResultAsync.fromSafePromise(Promise.resolve(manifest));
      }
      return ResultAsync.fromPromise(
        Promise.reject(
          new SnapshotStoreError(SnapshotStoreErrorCode.MANIFEST_NOT_FOUND, 'Not found'),
        ),
        (e) => e as SnapshotStoreError,
      );
    }),
    downloadFile: vi.fn((_key: string, _destPath: string, _sha256?: string) => {
      return ResultAsync.fromSafePromise(Promise.resolve('abc123'));
    }),
    putManifest: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve(undefined as void))),
    uploadFile: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve('abc123'))),
    listVersions: vi.fn(() => ResultAsync.fromSafePromise(Promise.resolve([]))),
  } as unknown as SnapshotStore;
}

function createMockDeps(dfAvailBytes = '10000000000'): SyncDeps {
  return {
    spawn: vi.fn(async (cmd: string[]) => {
      if (cmd[0] === 'df') {
        return { exitCode: 0, stdout: `Avail\n${dfAvailBytes}\n`, stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    }),
    sleep: vi.fn(async (_ms: number) => {}),
  };
}

describe('createSyncLoop', () => {
  let tmpBase: string;
  let localDir: string;
  let tempDir: string;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    tmpBase = await mkdtemp(join(tmpdir(), 'sync-test-'));
    localDir = join(tmpBase, 'agent-latest');
    tempDir = join(tmpBase, '.downloading');
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(tmpBase, { recursive: true, force: true });
  });

  function makeConfig(store: SnapshotStore): SyncConfig {
    return {
      store,
      snapshotId: 'agent-latest',
      localDir,
      pollIntervalMs: 300_000,
      tempDir,
    };
  }

  it('skips download when local version matches remote', async () => {
    const manifest = makeManifest(3);
    const store = createMockStore(manifest);

    // Set up local dir with matching version
    const versionDir = join(tmpBase, 'v3');
    await mkdir(versionDir, { recursive: true });
    await writeFile(
      join(versionDir, 'manifest.json'),
      JSON.stringify({ id: 'agent-latest', version: 3 }),
    );
    await symlink(versionDir, localDir);

    const deps = createMockDeps();
    const loop = createSyncLoop(makeConfig(store), deps);

    await loop._tick();

    expect(store.getManifest).toHaveBeenCalledWith('agent-latest');
    expect(store.downloadFile).not.toHaveBeenCalled();
    expect(loop.status().currentVersion).toBe(3);
    expect(loop.status().lastError).toBeNull();
    expect(loop.status().lastCheck).toBeInstanceOf(Date);
  });

  it('downloads files and swaps symlink on new version', async () => {
    const manifest = makeManifest(2);
    const store = createMockStore(manifest);

    // Set up local dir with old version
    const oldDir = join(tmpBase, 'v1');
    await mkdir(oldDir, { recursive: true });
    await writeFile(
      join(oldDir, 'manifest.json'),
      JSON.stringify({ id: 'agent-latest', version: 1 }),
    );
    await symlink(oldDir, localDir);

    const deps = createMockDeps();
    const loop = createSyncLoop(makeConfig(store), deps);

    await loop._tick();

    // Should have downloaded both files
    expect(store.downloadFile).toHaveBeenCalledTimes(2);

    // Verify symlink points to new version dir
    const target = await readlink(localDir);
    expect(target).toBe(join(tempDir, 'v2'));

    // Verify manifest was written
    const writtenManifest = JSON.parse(
      await readFile(join(tempDir, 'v2', 'manifest.json'), 'utf-8'),
    );
    expect(writtenManifest.version).toBe(2);

    // Status should reflect new version
    expect(loop.status().currentVersion).toBe(2);
    expect(loop.status().lastError).toBeNull();
  });

  it('retries failed downloads then skips', async () => {
    const manifest = makeManifest(2);
    const store = createMockStore(manifest);

    // Make downloadFile always fail
    (store.downloadFile as ReturnType<typeof vi.fn>).mockImplementation(() =>
      ResultAsync.fromPromise(
        Promise.reject(
          new SnapshotStoreError(SnapshotStoreErrorCode.DOWNLOAD_FAILED, 'Network error'),
        ),
        (e) => e as SnapshotStoreError,
      ),
    );

    const deps = createMockDeps();
    const loop = createSyncLoop(makeConfig(store), deps);

    await loop._tick();

    // 4 attempts total (1 initial + 3 retries) for the first file
    expect(store.downloadFile).toHaveBeenCalledTimes(4);
    // sleep called 3 times for retries
    expect(deps.sleep).toHaveBeenCalledTimes(3);
    expect(deps.sleep).toHaveBeenCalledWith(2_000);
    expect(deps.sleep).toHaveBeenCalledWith(8_000);
    expect(deps.sleep).toHaveBeenCalledWith(32_000);

    expect(loop.status().lastError).toContain('Download failed');
    expect(loop.status().currentVersion).toBe(0);
  });

  it('cleans up on checksum mismatch (download returns error)', async () => {
    const manifest = makeManifest(2);
    const store = createMockStore(manifest);

    // First file succeeds, second always fails with checksum mismatch
    let callCount = 0;
    (store.downloadFile as ReturnType<typeof vi.fn>).mockImplementation(
      (key: string, _dest: string, _sha256?: string) => {
        callCount++;
        // First file always succeeds
        if (key.includes('disk.ext4')) {
          return ResultAsync.fromSafePromise(Promise.resolve('abc123'));
        }
        // Second file always fails
        return ResultAsync.fromPromise(
          Promise.reject(
            new SnapshotStoreError(SnapshotStoreErrorCode.CHECKSUM_MISMATCH, 'Checksum mismatch'),
          ),
          (e) => e as SnapshotStoreError,
        );
      },
    );

    const deps = createMockDeps();
    const loop = createSyncLoop(makeConfig(store), deps);

    await loop._tick();

    expect(loop.status().lastError).toContain('Download failed');
    expect(loop.status().currentVersion).toBe(0);
  });

  it('skips sync when disk space is insufficient', async () => {
    const manifest = makeManifest(2);
    const store = createMockStore(manifest);

    // Report very little disk space (100 bytes)
    const deps = createMockDeps('100');
    const loop = createSyncLoop(makeConfig(store), deps);

    await loop._tick();

    expect(store.downloadFile).not.toHaveBeenCalled();
    expect(loop.status().lastError).toContain('Insufficient disk space');
  });

  it('returns correct initial status', () => {
    const store = createMockStore(null);
    const loop = createSyncLoop(makeConfig(store));

    const initial = loop.status();
    expect(initial.currentVersion).toBe(0);
    expect(initial.syncing).toBe(false);
    expect(initial.lastCheck).toBeNull();
    expect(initial.lastError).toBeNull();
  });

  it('start() and stop() manage the interval', async () => {
    // Use a manifest that matches local so no downloads/symlinks are created
    const manifest = makeManifest(1);
    const store = createMockStore(manifest);

    // Set up local dir with matching version so tick is a no-op
    const versionDir = join(tmpBase, 'v1');
    await mkdir(versionDir, { recursive: true });
    await writeFile(
      join(versionDir, 'manifest.json'),
      JSON.stringify({ id: 'agent-latest', version: 1 }),
    );
    await symlink(versionDir, localDir);

    const deps = createMockDeps();
    const loop = createSyncLoop(makeConfig(store), deps);

    loop.start();

    // Flush the initial tick
    await vi.advanceTimersByTimeAsync(0);

    // Advance timer to trigger another tick
    await vi.advanceTimersByTimeAsync(300_000);

    loop.stop();

    // At least the initial tick should have fired
    expect(
      (store.getManifest as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('handles first sync with no existing symlink', async () => {
    const manifest = makeManifest(1);
    const store = createMockStore(manifest);
    const deps = createMockDeps();
    const loop = createSyncLoop(makeConfig(store), deps);

    await loop._tick();

    // Should have downloaded files
    expect(store.downloadFile).toHaveBeenCalledTimes(2);

    // Verify symlink was created
    const target = await readlink(localDir);
    expect(target).toBe(join(tempDir, 'v1'));

    expect(loop.status().currentVersion).toBe(1);
    expect(loop.status().lastError).toBeNull();
  });

  it('handles getManifest failure gracefully', async () => {
    const store = createMockStore(null);
    const deps = createMockDeps();
    const loop = createSyncLoop(makeConfig(store), deps);

    await loop._tick();

    expect(loop.status().lastError).toContain('Not found');
    expect(store.downloadFile).not.toHaveBeenCalled();
  });
});
