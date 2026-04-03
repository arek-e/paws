import { ResultAsync } from 'neverthrow';

import type { ExecFn } from '@paws/firecracker';
import { RuntimeError, RuntimeErrorCode } from '@paws/runtime';

/** Result of a command executed over SSH */
export interface SshExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Options for SSH operations */
export interface SshOptions {
  host: string;
  port?: number;
  keyPath: string;
  user?: string;
  connectTimeoutSecs?: number;
  exec?: ExecFn;
}

const DEFAULT_SSH_PORT = 22;
const DEFAULT_SSH_USER = 'root';
const DEFAULT_CONNECT_TIMEOUT = 30;

function baseSshArgs(opts: SshOptions): string[] {
  const port = opts.port ?? DEFAULT_SSH_PORT;
  const timeout = opts.connectTimeoutSecs ?? DEFAULT_CONNECT_TIMEOUT;
  return [
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'UserKnownHostsFile=/dev/null',
    '-o',
    `ConnectTimeout=${timeout}`,
    '-o',
    'LogLevel=ERROR',
    '-i',
    opts.keyPath,
    '-p',
    String(port),
  ];
}

/** Wait for SSH to become available on the guest */
export function waitForSsh(
  opts: SshOptions,
  maxAttempts: number = 60,
  intervalMs: number = 500,
): ResultAsync<void, RuntimeError> {
  const exec = opts.exec ?? defaultExecFn;
  const user = opts.user ?? DEFAULT_SSH_USER;

  return ResultAsync.fromPromise(
    (async () => {
      for (let i = 0; i < maxAttempts; i++) {
        try {
          await exec('ssh', [...baseSshArgs(opts), `${user}@${opts.host}`, 'true']);
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      }
      throw new Error(`SSH not available after ${maxAttempts * intervalMs}ms`);
    })(),
    (e) =>
      new RuntimeError(
        RuntimeErrorCode.SSH_FAILED,
        `SSH connection to ${opts.host} timed out: ${e}`,
        e,
      ),
  );
}

/** Execute a command over SSH */
export function sshExec(
  opts: SshOptions,
  command: string,
): ResultAsync<SshExecResult, RuntimeError> {
  const exec = opts.exec ?? defaultExecFn;
  const user = opts.user ?? DEFAULT_SSH_USER;

  return ResultAsync.fromPromise(
    (async () => {
      const result = await exec('ssh', [...baseSshArgs(opts), `${user}@${opts.host}`, command]);
      return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
    })(),
    (e) =>
      new RuntimeError(RuntimeErrorCode.SSH_FAILED, `SSH command failed on ${opts.host}: ${e}`, e),
  );
}

/** Write content to a file on the guest via SSH */
export function sshWriteFile(
  opts: SshOptions,
  remotePath: string,
  content: string,
): ResultAsync<void, RuntimeError> {
  const user = opts.user ?? DEFAULT_SSH_USER;
  const port = opts.port ?? DEFAULT_SSH_PORT;
  const timeout = opts.connectTimeoutSecs ?? DEFAULT_CONNECT_TIMEOUT;

  return ResultAsync.fromPromise(
    (async () => {
      const proc = Bun.spawn(
        [
          'ssh',
          '-o',
          'StrictHostKeyChecking=no',
          '-o',
          'UserKnownHostsFile=/dev/null',
          '-o',
          `ConnectTimeout=${timeout}`,
          '-o',
          'LogLevel=ERROR',
          '-i',
          opts.keyPath,
          '-p',
          String(port),
          `${user}@${opts.host}`,
          `cat > ${remotePath}`,
        ],
        { stdin: new TextEncoder().encode(content) },
      );
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        throw new Error(`SSH write to ${remotePath} failed with exit code ${exitCode}`);
      }
    })(),
    (e) =>
      new RuntimeError(
        RuntimeErrorCode.SSH_FAILED,
        `Failed to write ${remotePath} on ${opts.host}: ${e}`,
        e,
      ),
  );
}

/** Read a file from the guest via SSH */
export function sshReadFile(
  opts: SshOptions,
  remotePath: string,
): ResultAsync<string, RuntimeError> {
  return sshExec(opts, `cat ${remotePath}`).map((r) => r.stdout);
}

/** Default exec using Bun.spawn with captured output */
const defaultExecFn: ExecFn = async (cmd, args) => {
  const proc = Bun.spawn([cmd, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  if (exitCode !== 0) {
    const err = new Error(`${cmd} exited with ${exitCode}: ${stderr}`);
    Object.assign(err, { exitCode });
    throw err;
  }
  return { stdout, stderr };
};
