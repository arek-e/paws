/** Injected shell exec function for testability */
export type ExecFn = (
  cmd: string,
  args: readonly string[],
) => Promise<{ stdout: string; stderr: string }>;

/** Injected HTTP request function for Firecracker API */
export type RequestFn = (
  method: string,
  path: string,
  body?: unknown,
) => Promise<{ statusCode: number; body: string }>;

/** Handle to a running Firecracker VM */
export interface VmHandle {
  /** Firecracker API socket path */
  socketPath: string;
  /** Firecracker process ID */
  pid: number;
  /** VM working directory */
  vmDir: string;
  /** Path to the copied disk image */
  diskPath: string;
}
