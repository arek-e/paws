import { ResultAsync } from 'neverthrow';

import { FirecrackerError, FirecrackerErrorCode } from '../errors.js';
import { defaultExec } from '../network/exec.js';
import type { ExecFn, VmHandle } from '../types.js';

export interface StopOptions {
  /** Injected exec for testability */
  exec?: ExecFn;
  /** Whether to remove the VM working directory */
  cleanup?: boolean;
}

/**
 * Stop a running Firecracker VM.
 *
 * 1. Kill the Firecracker process
 * 2. Remove the API socket
 * 3. Optionally clean up the VM working directory
 */
export function stopVm(
  handle: VmHandle,
  options: StopOptions = {},
): ResultAsync<void, FirecrackerError> {
  const exec = options.exec ?? defaultExec;
  const cleanup = options.cleanup ?? true;

  return ResultAsync.fromPromise(
    (async () => {
      // Kill the Firecracker process
      try {
        process.kill(handle.pid, 'SIGTERM');
      } catch {
        // Process may already be dead — that's fine
      }

      // Wait briefly for process to exit, then force kill
      await new Promise((resolve) => setTimeout(resolve, 500));

      try {
        // Check if still alive and force kill
        process.kill(handle.pid, 0);
        process.kill(handle.pid, 'SIGKILL');
      } catch {
        // Process is already gone
      }

      // Clean up VM directory
      if (cleanup) {
        await exec('rm', ['-rf', handle.vmDir]);
      }
    })(),
    (e) =>
      new FirecrackerError(
        FirecrackerErrorCode.VM_STOP_FAILED,
        `Failed to stop VM (pid ${handle.pid}): ${e}`,
        e,
      ),
  );
}
