import { describe, expect, it } from 'vitest';

import type { ExecFn } from '../types.js';
import type { FirecrackerAllocation } from './ip-pool.js';

import { createTap, deleteTap } from './tap.js';

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

const testAlloc: FirecrackerAllocation = {
  tapDevice: 'tap0',
  subnetIndex: 0,
  hostIp: '172.16.0.1',
  guestIp: '172.16.0.2',
  subnet: '172.16.0.0/30',
};

describe('createTap', () => {
  it('runs ip commands in correct order', async () => {
    const { exec, calls } = createMockExec();

    const result = await createTap(testAlloc, { exec });
    expect(result.isOk()).toBe(true);

    expect(calls).toEqual([
      { cmd: 'ip', args: ['tuntap', 'add', 'tap0', 'mode', 'tap'] },
      { cmd: 'ip', args: ['addr', 'add', '172.16.0.1/30', 'dev', 'tap0'] },
      { cmd: 'ip', args: ['link', 'set', 'tap0', 'up'] },
    ]);
  });

  it('returns error when exec fails', async () => {
    const exec: ExecFn = async () => {
      throw new Error('permission denied');
    };

    const result = await createTap(testAlloc, { exec });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('TAP_CREATE_FAILED');
  });
});

describe('deleteTap', () => {
  it('runs ip link del', async () => {
    const { exec, calls } = createMockExec();

    const result = await deleteTap('tap0', { exec });
    expect(result.isOk()).toBe(true);

    expect(calls).toEqual([{ cmd: 'ip', args: ['link', 'del', 'tap0'] }]);
  });

  it('returns error when exec fails', async () => {
    const exec: ExecFn = async () => {
      throw new Error('device not found');
    };

    const result = await deleteTap('tap0', { exec });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('TAP_DELETE_FAILED');
  });
});
