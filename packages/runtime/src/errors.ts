/** Base error class for all paws errors */
export class PawsError extends Error {
  readonly code: string;
  override readonly cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.cause = cause;
  }
}

/** Runtime error codes */
export const RuntimeErrorCode = {
  NO_RUNTIME: 'NO_RUNTIME',
  CAPACITY_EXHAUSTED: 'CAPACITY_EXHAUSTED',
  NETWORK_SETUP_FAILED: 'NETWORK_SETUP_FAILED',
  PROXY_FAILED: 'PROXY_FAILED',
  VM_RESTORE_FAILED: 'VM_RESTORE_FAILED',
  SSH_FAILED: 'SSH_FAILED',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  CLEANUP_FAILED: 'CLEANUP_FAILED',
  CA_GENERATION_FAILED: 'CA_GENERATION_FAILED',
  TIMEOUT: 'TIMEOUT',
} as const;

export type RuntimeErrorCode = (typeof RuntimeErrorCode)[keyof typeof RuntimeErrorCode];

/** Error thrown by runtime adapters */
export class RuntimeError extends PawsError {
  override readonly code: RuntimeErrorCode;

  constructor(code: RuntimeErrorCode, message: string, cause?: unknown) {
    super(code, message, cause);
    this.code = code;
  }
}
