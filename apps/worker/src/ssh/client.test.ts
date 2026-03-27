import { describe, expect, test } from 'vitest';

import type { ExecFn } from '@paws/firecracker';

import { waitForSsh, sshExec, sshReadFile } from './client.js';

function createMockExec(
  behavior: 'success' | 'fail' | 'fail-then-succeed' = 'success',
): ExecFn & { calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  let callCount = 0;

  const exec = (async (cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    callCount++;

    if (behavior === 'fail') {
      const err = new Error(`${cmd} failed`);
      Object.assign(err, { exitCode: 1 });
      throw err;
    }

    if (behavior === 'fail-then-succeed' && callCount <= 2) {
      throw new Error('connection refused');
    }

    return { stdout: 'ok\n', stderr: '' };
  }) as ExecFn & { calls: Array<{ cmd: string; args: string[] }> };
  exec.calls = calls;
  return exec;
}

describe('waitForSsh', () => {
  test('succeeds on first attempt when SSH is available', async () => {
    const exec = createMockExec('success');
    const result = await waitForSsh({ host: '172.16.0.2', keyPath: '/tmp/key', exec });

    expect(result.isOk()).toBe(true);
    expect(exec.calls).toHaveLength(1);
    expect(exec.calls[0]?.cmd).toBe('ssh');
  });

  test('includes correct base SSH args', async () => {
    const exec = createMockExec('success');
    await waitForSsh({ host: '172.16.0.2', keyPath: '/tmp/key', exec });

    const args = exec.calls[0]?.args ?? [];
    expect(args).toContain('StrictHostKeyChecking=no');
    expect(args).toContain('UserKnownHostsFile=/dev/null');
    expect(args).toContain('LogLevel=ERROR');
    expect(args).toContain('/tmp/key');
    expect(args).toContain('root@172.16.0.2');
    expect(args).toContain('true');
  });

  test('uses custom port and user', async () => {
    const exec = createMockExec('success');
    await waitForSsh({ host: '172.16.0.2', keyPath: '/tmp/key', port: 2222, user: 'ubuntu', exec });

    const args = exec.calls[0]?.args ?? [];
    expect(args).toContain('2222');
    expect(args).toContain('ubuntu@172.16.0.2');
  });

  test('uses custom connect timeout', async () => {
    const exec = createMockExec('success');
    await waitForSsh({ host: '172.16.0.2', keyPath: '/tmp/key', connectTimeoutSecs: 5, exec });

    const args = exec.calls[0]?.args ?? [];
    expect(args).toContain('ConnectTimeout=5');
  });

  test('retries on failure until success', async () => {
    const exec = createMockExec('fail-then-succeed');
    const result = await waitForSsh(
      { host: '172.16.0.2', keyPath: '/tmp/key', exec },
      5,
      1, // 1ms interval for fast tests
    );

    expect(result.isOk()).toBe(true);
    // Failed twice, succeeded on third
    expect(exec.calls).toHaveLength(3);
  });

  test('returns error after max attempts', async () => {
    const exec = createMockExec('fail');
    const result = await waitForSsh(
      { host: '172.16.0.2', keyPath: '/tmp/key', exec },
      3,
      1, // 1ms interval
    );

    expect(result.isErr()).toBe(true);
    const err = result._unsafeUnwrapErr();
    expect(err.code).toBe('SSH_FAILED');
    expect(err.message).toContain('172.16.0.2');
    expect(err.message).toContain('timed out');
    expect(exec.calls).toHaveLength(3);
  });
});

describe('sshExec', () => {
  test('executes command on remote host', async () => {
    const exec = createMockExec('success');
    const result = await sshExec({ host: '172.16.0.2', keyPath: '/tmp/key', exec }, 'echo hello');

    expect(result.isOk()).toBe(true);
    const data = result._unsafeUnwrap();
    expect(data.stdout).toBe('ok\n');
    expect(data.exitCode).toBe(0);

    const args = exec.calls[0]?.args ?? [];
    expect(args[args.length - 1]).toBe('echo hello');
  });

  test('returns error on command failure', async () => {
    const exec = createMockExec('fail');
    const result = await sshExec({ host: '172.16.0.2', keyPath: '/tmp/key', exec }, 'fail-cmd');

    expect(result.isErr()).toBe(true);
    const err = result._unsafeUnwrapErr();
    expect(err.code).toBe('SSH_FAILED');
    expect(err.message).toContain('SSH command failed');
    expect(err.message).toContain('172.16.0.2');
  });
});

describe('sshReadFile', () => {
  test('reads file via cat command', async () => {
    const exec = createMockExec('success');
    const result = await sshReadFile(
      { host: '172.16.0.2', keyPath: '/tmp/key', exec },
      '/tmp/output.json',
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('ok\n');

    const args = exec.calls[0]?.args ?? [];
    expect(args[args.length - 1]).toBe('cat /tmp/output.json');
  });
});
