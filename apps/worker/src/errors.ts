/** Error codes for worker operations */
export const WorkerErrorCode = {
  CAPACITY_EXHAUSTED: 'CAPACITY_EXHAUSTED',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_TIMEOUT: 'SESSION_TIMEOUT',
  SSH_FAILED: 'SSH_FAILED',
  PROXY_FAILED: 'PROXY_FAILED',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
} as const;

export type WorkerErrorCode = (typeof WorkerErrorCode)[keyof typeof WorkerErrorCode];

/** Typed error for worker operations */
export class WorkerError extends Error {
  readonly code: WorkerErrorCode;
  readonly cause?: unknown;

  constructor(code: WorkerErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'WorkerError';
    this.code = code;
    this.cause = cause;
  }
}
