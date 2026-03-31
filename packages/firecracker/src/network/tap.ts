import type { NetworkAllocation } from '@paws/domain-network';

import { ResultAsync } from 'neverthrow';

import { FirecrackerError, FirecrackerErrorCode } from '../errors.js';
import type { ExecFn } from '../types.js';

import { defaultExec } from './exec.js';

/** Create a TAP device and configure its IP address */
export function createTap(
  alloc: NetworkAllocation,
  options: { exec?: ExecFn } = {},
): ResultAsync<void, FirecrackerError> {
  const exec = options.exec ?? defaultExec;

  return ResultAsync.fromPromise(
    (async () => {
      // Create TAP device
      await exec('ip', ['tuntap', 'add', alloc.tapDevice, 'mode', 'tap']);

      // Assign host IP to TAP device
      await exec('ip', ['addr', 'add', `${alloc.hostIp}/30`, 'dev', alloc.tapDevice]);

      // Bring TAP device up
      await exec('ip', ['link', 'set', alloc.tapDevice, 'up']);
    })(),
    (e) =>
      new FirecrackerError(
        FirecrackerErrorCode.TAP_CREATE_FAILED,
        `Failed to create TAP device ${alloc.tapDevice}: ${e}`,
        e,
      ),
  );
}

/** Delete a TAP device */
export function deleteTap(
  tapDevice: string,
  options: { exec?: ExecFn } = {},
): ResultAsync<void, FirecrackerError> {
  const exec = options.exec ?? defaultExec;

  return ResultAsync.fromPromise(
    (async () => {
      await exec('ip', ['link', 'del', tapDevice]);
    })(),
    (e) =>
      new FirecrackerError(
        FirecrackerErrorCode.TAP_DELETE_FAILED,
        `Failed to delete TAP device ${tapDevice}: ${e}`,
        e,
      ),
  );
}
