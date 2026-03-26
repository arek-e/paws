/** Error codes for firecracker package operations */
export const FirecrackerErrorCode = {
  SOCKET_NOT_FOUND: 'SOCKET_NOT_FOUND',
  API_ERROR: 'API_ERROR',
  SNAPSHOT_LOAD_FAILED: 'SNAPSHOT_LOAD_FAILED',
  VM_RESUME_FAILED: 'VM_RESUME_FAILED',
  VM_STOP_FAILED: 'VM_STOP_FAILED',
  DISK_COPY_FAILED: 'DISK_COPY_FAILED',
  PROCESS_SPAWN_FAILED: 'PROCESS_SPAWN_FAILED',
  TAP_CREATE_FAILED: 'TAP_CREATE_FAILED',
  TAP_DELETE_FAILED: 'TAP_DELETE_FAILED',
  IPTABLES_FAILED: 'IPTABLES_FAILED',
  IP_POOL_EXHAUSTED: 'IP_POOL_EXHAUSTED',
  EXEC_FAILED: 'EXEC_FAILED',
} as const;

export type FirecrackerErrorCode = (typeof FirecrackerErrorCode)[keyof typeof FirecrackerErrorCode];

/** Typed error for all firecracker package operations */
export class FirecrackerError extends Error {
  readonly code: FirecrackerErrorCode;
  readonly cause?: unknown;

  constructor(code: FirecrackerErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'FirecrackerError';
    this.code = code;
    this.cause = cause;
  }
}
