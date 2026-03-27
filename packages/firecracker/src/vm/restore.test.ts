import { describe, expect, it } from 'vitest';

import { FirecrackerErrorCode } from '../errors.js';
import type { ExecFn, RequestFn } from '../types.js';

import type { SpawnFn } from './restore.js';
import { restoreVm } from './restore.js';

function createMockExec(): {
  exec: ExecFn;
  calls: Array<{ cmd: string; args: readonly string[] }>;
} {
  const calls: Array<{ cmd: string; args: readonly string[] }> = [];
  return {
    exec: async (cmd, args) => {
      calls.push({ cmd, args });
      return { stdout: '', stderr: '' };
    },
    calls,
  };
}

function createMockRequest(responses: Record<string, { statusCode: number; body: string }>): {
  request: RequestFn;
  calls: Array<{ method: string; path: string; body?: unknown }>;
} {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  return {
    request: async (method, path, body) => {
      calls.push({ method, path, body });
      const key = `${method} ${path}`;
      return responses[key] ?? { statusCode: 200, body: '' };
    },
    calls,
  };
}

function createMockSpawn(): {
  spawn: SpawnFn;
  calls: Array<{ cmd: string[]; cwd: string }>;
} {
  const calls: Array<{ cmd: string[]; cwd: string }> = [];
  return {
    spawn: (cmd, options) => {
      calls.push({ cmd, cwd: options.cwd });
      return { pid: 12345 };
    },
    calls,
  };
}

describe('restoreVm', () => {
  it('copies disk, loads snapshot, updates drive, and resumes VM', async () => {
    const { exec, calls: execCalls } = createMockExec();
    const { request, calls: apiCalls } = createMockRequest({
      'PUT /snapshot/load': { statusCode: 204, body: '' },
      'PUT /drives/rootfs': { statusCode: 204, body: '' },
      'PATCH /vm': { statusCode: 204, body: '' },
    });
    const { spawn, calls: spawnCalls } = createMockSpawn();

    const result = await restoreVm({
      snapshotDir: '/snapshots/test',
      vmDir: '/vms/vm-1',
      exec,
      request,
      spawn,
    });

    expect(result.isOk()).toBe(true);
    const handle = result._unsafeUnwrap();

    // Verify exec calls: mkdir, cp, then test (socket wait)
    expect(execCalls[0]).toEqual({
      cmd: 'mkdir',
      args: ['-p', '/vms/vm-1'],
    });
    expect(execCalls[1]).toEqual({
      cmd: 'cp',
      args: ['--reflink=auto', '/snapshots/test/disk.ext4', '/vms/vm-1/disk.ext4'],
    });

    // Verify spawn was called with firecracker args
    expect(spawnCalls[0]!.cmd).toEqual([
      'firecracker',
      '--api-sock',
      '/vms/vm-1/firecracker.sock',
      '--id',
      'vm',
    ]);
    expect(spawnCalls[0]!.cwd).toBe('/vms/vm-1');

    // Verify API calls
    expect(apiCalls[0]!.method).toBe('PUT');
    expect(apiCalls[0]!.path).toBe('/snapshot/load');
    expect(apiCalls[0]!.body).toEqual({
      snapshot_path: '/snapshots/test/vmstate.snap',
      mem_backend: {
        backend_type: 'File',
        backend_path: '/snapshots/test/memory.snap',
      },
      resume_vm: false,
    });

    // Drive update
    expect(apiCalls[1]!.path).toBe('/drives/rootfs');

    // Resume
    expect(apiCalls[2]!.method).toBe('PATCH');
    expect(apiCalls[2]!.path).toBe('/vm');

    // Handle
    expect(handle.socketPath).toBe('/vms/vm-1/firecracker.sock');
    expect(handle.diskPath).toBe('/vms/vm-1/disk.ext4');
    expect(handle.vmDir).toBe('/vms/vm-1');
    expect(handle.pid).toBe(12345);
  });

  it('returns error when snapshot load fails', async () => {
    const { exec } = createMockExec();
    const { request } = createMockRequest({
      'PUT /snapshot/load': {
        statusCode: 400,
        body: 'invalid snapshot',
      },
    });
    const { spawn } = createMockSpawn();

    const result = await restoreVm({
      snapshotDir: '/snapshots/test',
      vmDir: '/vms/vm-1',
      exec,
      request,
      spawn,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe(FirecrackerErrorCode.SNAPSHOT_LOAD_FAILED);
  });

  it('returns error when resume fails', async () => {
    const { exec } = createMockExec();
    const { request } = createMockRequest({
      'PUT /snapshot/load': { statusCode: 204, body: '' },
      'PUT /drives/rootfs': { statusCode: 204, body: '' },
      'PATCH /vm': { statusCode: 400, body: 'cannot resume' },
    });
    const { spawn } = createMockSpawn();

    const result = await restoreVm({
      snapshotDir: '/snapshots/test',
      vmDir: '/vms/vm-1',
      exec,
      request,
      spawn,
    });

    expect(result.isErr()).toBe(true);
  });
});
