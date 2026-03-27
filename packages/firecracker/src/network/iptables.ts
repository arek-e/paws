import type { NetworkAllocation } from '@paws/types';

import { ResultAsync } from 'neverthrow';

import { FirecrackerError, FirecrackerErrorCode } from '../errors.js';
import type { ExecFn } from '../types.js';

import { defaultExec } from './exec.js';

export interface IptablesConfig {
  /** Port on proxy for HTTP traffic */
  httpPort?: number;
  /** Port on proxy for HTTPS traffic */
  httpsPort?: number;
}

const DEFAULT_HTTP_PORT = 8080;
const DEFAULT_HTTPS_PORT = 8443;

/**
 * Set up iptables rules for a VM:
 * - DNAT ports 80/443 from the VM's TAP to the host-side proxy
 * - Allow forwarded traffic to the proxy
 * - Allow established connections back
 * - Drop everything else from this TAP
 */
export function setupIptables(
  alloc: NetworkAllocation,
  config: IptablesConfig = {},
  options: { exec?: ExecFn } = {},
): ResultAsync<void, FirecrackerError> {
  const exec = options.exec ?? defaultExec;
  const httpPort = config.httpPort ?? DEFAULT_HTTP_PORT;
  const httpsPort = config.httpsPort ?? DEFAULT_HTTPS_PORT;

  return ResultAsync.fromPromise(
    (async () => {
      // DNAT HTTP to proxy
      await exec('iptables', [
        '-t',
        'nat',
        '-A',
        'PREROUTING',
        '-i',
        alloc.tapDevice,
        '-p',
        'tcp',
        '--dport',
        '80',
        '-j',
        'DNAT',
        '--to',
        `${alloc.hostIp}:${httpPort}`,
      ]);

      // DNAT HTTPS to proxy
      await exec('iptables', [
        '-t',
        'nat',
        '-A',
        'PREROUTING',
        '-i',
        alloc.tapDevice,
        '-p',
        'tcp',
        '--dport',
        '443',
        '-j',
        'DNAT',
        '--to',
        `${alloc.hostIp}:${httpsPort}`,
      ]);

      // Allow traffic to proxy
      await exec('iptables', [
        '-A',
        'FORWARD',
        '-i',
        alloc.tapDevice,
        '-d',
        alloc.hostIp,
        '-j',
        'ACCEPT',
      ]);

      // Allow established connections back
      await exec('iptables', [
        '-A',
        'FORWARD',
        '-o',
        alloc.tapDevice,
        '-m',
        'conntrack',
        '--ctstate',
        'RELATED,ESTABLISHED',
        '-j',
        'ACCEPT',
      ]);

      // Drop everything else from this VM
      await exec('iptables', ['-A', 'FORWARD', '-i', alloc.tapDevice, '-j', 'DROP']);
    })(),
    (e) =>
      new FirecrackerError(
        FirecrackerErrorCode.IPTABLES_FAILED,
        `Failed to setup iptables for ${alloc.tapDevice}: ${e}`,
        e,
      ),
  );
}

/**
 * Tear down iptables rules for a VM.
 * Uses -D (delete) to remove the exact rules that were added.
 */
export function teardownIptables(
  alloc: NetworkAllocation,
  config: IptablesConfig = {},
  options: { exec?: ExecFn } = {},
): ResultAsync<void, FirecrackerError> {
  const exec = options.exec ?? defaultExec;
  const httpPort = config.httpPort ?? DEFAULT_HTTP_PORT;
  const httpsPort = config.httpsPort ?? DEFAULT_HTTPS_PORT;

  return ResultAsync.fromPromise(
    (async () => {
      // Remove in reverse order
      await exec('iptables', ['-D', 'FORWARD', '-i', alloc.tapDevice, '-j', 'DROP']);

      await exec('iptables', [
        '-D',
        'FORWARD',
        '-o',
        alloc.tapDevice,
        '-m',
        'conntrack',
        '--ctstate',
        'RELATED,ESTABLISHED',
        '-j',
        'ACCEPT',
      ]);

      await exec('iptables', [
        '-D',
        'FORWARD',
        '-i',
        alloc.tapDevice,
        '-d',
        alloc.hostIp,
        '-j',
        'ACCEPT',
      ]);

      await exec('iptables', [
        '-t',
        'nat',
        '-D',
        'PREROUTING',
        '-i',
        alloc.tapDevice,
        '-p',
        'tcp',
        '--dport',
        '443',
        '-j',
        'DNAT',
        '--to',
        `${alloc.hostIp}:${httpsPort}`,
      ]);

      await exec('iptables', [
        '-t',
        'nat',
        '-D',
        'PREROUTING',
        '-i',
        alloc.tapDevice,
        '-p',
        'tcp',
        '--dport',
        '80',
        '-j',
        'DNAT',
        '--to',
        `${alloc.hostIp}:${httpPort}`,
      ]);
    })(),
    (e) =>
      new FirecrackerError(
        FirecrackerErrorCode.IPTABLES_FAILED,
        `Failed to teardown iptables for ${alloc.tapDevice}: ${e}`,
        e,
      ),
  );
}
