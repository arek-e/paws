import {
  mkdir,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { SnapshotStore } from '@paws/snapshot-store';
import type { SnapshotManifest } from '@paws/snapshot-store';

export interface SyncConfig {
  store: SnapshotStore;
  snapshotId: string;
  /** Local symlink path, e.g. /var/lib/paws/snapshots/agent-latest */
  localDir: string;
  pollIntervalMs: number;
  /** Temp download directory, e.g. /var/lib/paws/snapshots/.downloading */
  tempDir: string;
}

export interface SyncStatus {
  currentVersion: number;
  syncing: boolean;
  lastCheck: Date | null;
  lastError: string | null;
}

export interface SyncLoop {
  start(): void;
  stop(): void;
  status(): SyncStatus;
  /** Exposed for testing -- run one sync cycle */
  _tick(): Promise<void>;
}

export interface SyncDeps {
  /** Run a shell command, returns { exitCode, stdout, stderr } */
  spawn: (cmd: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  /** Delay function (injectable for testing) */
  sleep: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const defaultSpawn = async (
  cmd: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
  const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
};

/** Retry delays: 2s, 8s, 32s */
const RETRY_DELAYS = [2_000, 8_000, 32_000];

export function createSyncLoop(config: SyncConfig, deps?: Partial<SyncDeps>): SyncLoop {
  const { store, snapshotId, localDir, pollIntervalMs, tempDir } = config;
  const spawn = deps?.spawn ?? defaultSpawn;
  const delaySleep = deps?.sleep ?? defaultSleep;

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const state: SyncStatus = {
    currentVersion: 0,
    syncing: false,
    lastCheck: null,
    lastError: null,
  };

  async function readLocalVersion(): Promise<number> {
    try {
      const raw = await readFile(join(localDir, 'manifest.json'), 'utf-8');
      const manifest = JSON.parse(raw) as SnapshotManifest;
      return manifest.version;
    } catch {
      return 0;
    }
  }

  async function checkDiskSpace(requiredBytes: number): Promise<boolean> {
    try {
      const result = await spawn(['df', '--output=avail', '-B1', dirname(localDir)]);
      if (result.exitCode !== 0) return true; // assume OK if df fails
      const lines = result.stdout.trim().split('\n');
      const availStr = lines[lines.length - 1]?.trim();
      if (!availStr) return true;
      const avail = parseInt(availStr, 10);
      return avail >= requiredBytes;
    } catch {
      return true; // assume OK on error
    }
  }

  async function downloadWithRetries(
    fileKey: string,
    destPath: string,
    sha256: string,
  ): Promise<boolean> {
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      const result = await store.downloadFile(fileKey, destPath, sha256);
      if (result.isOk()) return true;

      if (attempt < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[attempt]!;
        console.warn(
          `[sync] Download failed for ${fileKey} (attempt ${attempt + 1}/${RETRY_DELAYS.length + 1}), retrying in ${delay}ms: ${result.error.message}`,
        );
        await delaySleep(delay);
      } else {
        console.error(
          `[sync] Download failed for ${fileKey} after ${RETRY_DELAYS.length + 1} attempts: ${result.error.message}`,
        );
      }
    }
    return false;
  }

  /**
   * Atomic symlink swap:
   * 1. Create a new symlink at a temp name
   * 2. Rename it over the target (rename is atomic on POSIX)
   */
  async function swapSymlink(newDir: string): Promise<void> {
    const linkNew = `${localDir}.new`;
    // Remove stale .new symlink if it exists
    await unlink(linkNew).catch(() => {});
    await symlink(newDir, linkNew);
    await rename(linkNew, localDir);
  }

  async function cleanupOldVersion(currentTarget: string | null, newDir: string): Promise<void> {
    if (currentTarget && currentTarget !== newDir) {
      try {
        await rm(currentTarget, { recursive: true, force: true });
        console.info(`[sync] Cleaned up old version dir: ${currentTarget}`);
      } catch (e) {
        console.warn(`[sync] Failed to clean up old dir ${currentTarget}: ${e}`);
      }
    }
  }

  async function tick(): Promise<void> {
    if (state.syncing) return;
    state.syncing = true;

    try {
      // 1. Fetch remote manifest
      const manifestResult = await store.getManifest(snapshotId);
      if (manifestResult.isErr()) {
        state.lastError = manifestResult.error.message;
        console.warn(`[sync] Failed to fetch manifest: ${manifestResult.error.message}`);
        return;
      }
      const remoteManifest = manifestResult.value;

      // 2. Read local version from disk
      const localVersion = await readLocalVersion();
      state.currentVersion = localVersion;
      state.lastCheck = new Date();

      // 3. Compare
      if (remoteManifest.version <= localVersion) {
        console.debug(
          `[sync] Up to date (local v${localVersion}, remote v${remoteManifest.version})`,
        );
        state.lastError = null;
        return;
      }

      console.info(
        `[sync] New version available: v${remoteManifest.version} (local: v${localVersion})`,
      );

      // 4. Check disk space (~2x total snapshot size)
      const totalSize = remoteManifest.files.reduce((sum, f) => sum + f.size, 0);
      const hasSpace = await checkDiskSpace(totalSize * 2);
      if (!hasSpace) {
        const msg = `Insufficient disk space for snapshot v${remoteManifest.version} (need ~${Math.round((totalSize * 2) / 1024 / 1024)}MB)`;
        state.lastError = msg;
        console.warn(`[sync] ${msg}`);
        return;
      }

      // 5. Download to temp dir
      const versionDir = join(tempDir, `v${remoteManifest.version}`);
      await mkdir(versionDir, { recursive: true });

      let allOk = true;
      for (const file of remoteManifest.files) {
        const destPath = join(versionDir, file.name);
        const ok = await downloadWithRetries(file.key, destPath, file.sha256);
        if (!ok) {
          allOk = false;
          break;
        }
      }

      if (!allOk) {
        await rm(versionDir, { recursive: true, force: true }).catch(() => {});
        state.lastError = `Download failed for snapshot v${remoteManifest.version}`;
        console.error(`[sync] ${state.lastError}`);
        return;
      }

      // 6. Write manifest into the new dir
      await writeFile(
        join(versionDir, 'manifest.json'),
        JSON.stringify(remoteManifest, null, 2),
        'utf-8',
      );

      // 7. Atomic symlink swap
      let currentTarget: string | null = null;
      try {
        currentTarget = await readlink(localDir);
      } catch {
        // symlink doesn't exist yet
      }

      await swapSymlink(versionDir);

      // 8. Clean up old version
      await cleanupOldVersion(currentTarget, versionDir);

      state.currentVersion = remoteManifest.version;
      state.lastError = null;
      console.info(`[sync] Updated to v${remoteManifest.version}`);
    } catch (e) {
      state.lastError = e instanceof Error ? e.message : String(e);
      console.error(`[sync] Unexpected error: ${state.lastError}`);
    } finally {
      state.syncing = false;
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      tick();
      intervalId = setInterval(() => tick(), pollIntervalMs);
    },

    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      running = false;
    },

    status() {
      return { ...state };
    },

    _tick: tick,
  };
}
