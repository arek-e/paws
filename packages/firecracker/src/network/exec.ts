import { FirecrackerError, FirecrackerErrorCode } from '../errors.js';
import type { ExecFn } from '../types.js';

/** Default exec implementation using Bun.spawn */
export const defaultExec: ExecFn = async (cmd, args) => {
  const proc = Bun.spawn([cmd, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new FirecrackerError(
      FirecrackerErrorCode.EXEC_FAILED,
      `Command "${cmd} ${args.join(' ')}" exited with code ${exitCode}: ${stderr}`,
    );
  }

  return { stdout, stderr };
};
