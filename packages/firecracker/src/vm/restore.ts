import { ResultAsync } from 'neverthrow';

import { createFirecrackerClient } from '../client.js';
import { FirecrackerError, FirecrackerErrorCode } from '../errors.js';
import { defaultExec } from '../network/exec.js';
import type { ExecFn, RequestFn, VmHandle } from '../types.js';

const DEFAULT_FIRECRACKER_BIN = 'firecracker';

/** Injected spawn function for testability */
export type SpawnFn = (cmd: string[], options: { cwd: string }) => { pid: number };

/** Default spawn using Bun.spawn */
const defaultSpawn: SpawnFn = (cmd, options) => {
  const proc = Bun.spawn(cmd, {
    stdout: 'ignore',
    stderr: 'ignore',
    cwd: options.cwd,
  });
  return { pid: proc.pid };
};

export interface RestoreOptions {
  /** Path to the snapshot directory (contains disk.ext4, memory.snap, vmstate.snap) */
  snapshotDir: string;
  /** Path to the VM working directory (where disk copy + socket go) */
  vmDir: string;
  /** Path to the Firecracker binary */
  firecrackerBin?: string;
  /** Injected exec for testability */
  exec?: ExecFn;
  /** Injected request for Firecracker API testability */
  request?: RequestFn;
  /** Injected spawn for testability */
  spawn?: SpawnFn;
}

/**
 * Restore a Firecracker VM from a snapshot.
 *
 * 1. Copy disk.ext4 with CoW (--reflink=auto) to vmDir
 * 2. Spawn firecracker process with --api-sock
 * 3. PUT /snapshot/load with memory + vmstate paths
 * 4. PATCH /vm { state: "Resumed" }
 */
export function restoreVm(options: RestoreOptions): ResultAsync<VmHandle, FirecrackerError> {
  const exec = options.exec ?? defaultExec;
  const spawn = options.spawn ?? defaultSpawn;
  const firecrackerBin = options.firecrackerBin ?? DEFAULT_FIRECRACKER_BIN;

  return ResultAsync.fromPromise(
    (async () => {
      const socketPath = `${options.vmDir}/firecracker.sock`;
      const diskPath = `${options.vmDir}/disk.ext4`;
      const memoryPath = `${options.snapshotDir}/memory.snap`;
      const vmstatePath = `${options.snapshotDir}/vmstate.snap`;

      // Ensure VM directory exists
      await exec('mkdir', ['-p', options.vmDir]);

      // Copy disk with CoW support
      await exec('cp', ['--reflink=auto', `${options.snapshotDir}/disk.ext4`, diskPath]);

      // Spawn Firecracker process
      const proc = spawn([firecrackerBin, '--api-sock', socketPath, '--id', 'vm'], {
        cwd: options.vmDir,
      });

      // Wait briefly for socket to become available
      await waitForSocket(socketPath, exec);

      // Load snapshot via Firecracker API
      const clientOpts = options.request ? { request: options.request } : {};
      const client = createFirecrackerClient(socketPath, clientOpts);

      const loadResult = await client.loadSnapshot({
        snapshot_path: vmstatePath,
        mem_backend: {
          backend_type: 'File',
          backend_path: memoryPath,
        },
        resume_vm: false,
      });

      if (loadResult.isErr()) throw loadResult.error;

      // Update disk path (snapshot uses original, we need the copy)
      const driveResult = await client.putDrive({
        drive_id: 'rootfs',
        path_on_host: diskPath,
        is_root_device: true,
        is_read_only: false,
      });

      if (driveResult.isErr()) throw driveResult.error;

      // Resume VM
      const resumeResult = await client.resumeVm();
      if (resumeResult.isErr()) throw resumeResult.error;

      return {
        socketPath,
        pid: proc.pid,
        vmDir: options.vmDir,
        diskPath,
      };
    })(),
    (e) => {
      if (e instanceof FirecrackerError) return e;
      return new FirecrackerError(
        FirecrackerErrorCode.SNAPSHOT_LOAD_FAILED,
        `Failed to restore VM: ${e}`,
        e,
      );
    },
  );
}

/** Poll for the Firecracker socket to appear */
async function waitForSocket(
  socketPath: string,
  exec: ExecFn,
  maxAttempts: number = 50,
  intervalMs: number = 100,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await exec('test', ['-S', socketPath]);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  throw new FirecrackerError(
    FirecrackerErrorCode.PROCESS_SPAWN_FAILED,
    `Firecracker socket ${socketPath} did not appear after ${maxAttempts * intervalMs}ms`,
  );
}
