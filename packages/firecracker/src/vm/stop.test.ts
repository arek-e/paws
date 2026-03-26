import { describe, expect, it, vi } from 'vitest';

import type { ExecFn, VmHandle } from '../types.js';

import { stopVm } from './stop.js';

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

const testHandle: VmHandle = {
  socketPath: '/vms/vm-1/firecracker.sock',
  pid: 99999,
  vmDir: '/vms/vm-1',
  diskPath: '/vms/vm-1/disk.ext4',
};

describe('stopVm', () => {
  it('kills process and cleans up VM directory', async () => {
    const { exec, calls } = createMockExec();
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const result = await stopVm(testHandle, { exec });
    expect(result.isOk()).toBe(true);

    // Should have tried to kill the process
    expect(killSpy).toHaveBeenCalledWith(99999, 'SIGTERM');

    // Should clean up VM directory
    expect(calls).toContainEqual({
      cmd: 'rm',
      args: ['-rf', '/vms/vm-1'],
    });

    killSpy.mockRestore();
  });

  it('skips cleanup when cleanup=false', async () => {
    const { exec, calls } = createMockExec();
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const result = await stopVm(testHandle, { exec, cleanup: false });
    expect(result.isOk()).toBe(true);

    // Should NOT clean up
    expect(calls).toEqual([]);

    killSpy.mockRestore();
  });

  it('succeeds even when process is already dead', async () => {
    const { exec } = createMockExec();
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });

    const result = await stopVm(testHandle, { exec });
    expect(result.isOk()).toBe(true);

    killSpy.mockRestore();
  });
});
