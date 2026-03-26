import { ResultAsync } from 'neverthrow';

import { FirecrackerError, FirecrackerErrorCode } from './errors.js';
import type { RequestFn } from './types.js';

/** Firecracker API response from PUT /snapshot/load */
export interface SnapshotLoadConfig {
  snapshot_path: string;
  mem_backend: {
    backend_type: 'File';
    backend_path: string;
  };
  enable_diff_snapshots?: boolean;
  resume_vm?: boolean;
}

/** Firecracker API response from GET /machine-config */
export interface MachineConfig {
  vcpu_count: number;
  mem_size_mib: number;
}

/** Drive configuration for PUT /drives/{id} */
export interface DriveConfig {
  drive_id: string;
  path_on_host: string;
  is_root_device: boolean;
  is_read_only: boolean;
}

/** Network interface for PUT /network-interfaces/{id} */
export interface NetworkInterfaceConfig {
  iface_id: string;
  guest_mac?: string;
  host_dev_name: string;
}

/** Default request implementation using HTTP over Unix socket */
function createUnixSocketRequest(socketPath: string): RequestFn {
  return async (method, path, body) => {
    const url = `http://localhost${path}`;
    const init: BunFetchRequestInit = { method, unix: socketPath };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);

    const text = await response.text();
    return { statusCode: response.status, body: text };
  };
}

/** Create a client for the Firecracker API over Unix socket */
export function createFirecrackerClient(socketPath: string, options: { request?: RequestFn } = {}) {
  const request = options.request ?? createUnixSocketRequest(socketPath);

  function apiCall(
    method: string,
    path: string,
    body?: unknown,
    errorCode: FirecrackerErrorCode = FirecrackerErrorCode.API_ERROR,
  ): ResultAsync<string, FirecrackerError> {
    return ResultAsync.fromPromise(
      request(method, path, body).then((res) => {
        if (res.statusCode >= 400) {
          throw new FirecrackerError(
            errorCode,
            `Firecracker API ${method} ${path} returned ${res.statusCode}: ${res.body}`,
          );
        }
        return res.body;
      }),
      (e) => {
        if (e instanceof FirecrackerError) return e;
        return new FirecrackerError(errorCode, `Firecracker API ${method} ${path} failed: ${e}`, e);
      },
    );
  }

  return {
    /** Load a snapshot (memory + vmstate) */
    loadSnapshot(config: SnapshotLoadConfig): ResultAsync<void, FirecrackerError> {
      return apiCall(
        'PUT',
        '/snapshot/load',
        config,
        FirecrackerErrorCode.SNAPSHOT_LOAD_FAILED,
      ).map(() => undefined);
    },

    /** Resume a paused VM */
    resumeVm(): ResultAsync<void, FirecrackerError> {
      return apiCall(
        'PATCH',
        '/vm',
        { state: 'Resumed' },
        FirecrackerErrorCode.VM_RESUME_FAILED,
      ).map(() => undefined);
    },

    /** Pause a running VM */
    pauseVm(): ResultAsync<void, FirecrackerError> {
      return apiCall('PATCH', '/vm', { state: 'Paused' }).map(() => undefined);
    },

    /** Get machine configuration */
    getMachineConfig(): ResultAsync<MachineConfig, FirecrackerError> {
      return apiCall('GET', '/machine-config').map((body) => JSON.parse(body) as MachineConfig);
    },

    /** Configure a drive */
    putDrive(config: DriveConfig): ResultAsync<void, FirecrackerError> {
      return apiCall('PUT', `/drives/${config.drive_id}`, config).map(() => undefined);
    },

    /** Configure a network interface */
    putNetworkInterface(config: NetworkInterfaceConfig): ResultAsync<void, FirecrackerError> {
      return apiCall('PUT', `/network-interfaces/${config.iface_id}`, config).map(() => undefined);
    },
  };
}

export type FirecrackerClient = ReturnType<typeof createFirecrackerClient>;
