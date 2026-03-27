import type { ErrorCode } from '@paws/types';

/** Typed error for gateway operations */
export class GatewayError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, httpStatus: number, cause?: unknown) {
    super(message);
    this.name = 'GatewayError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.cause = cause;
  }
}

/** HTTP status codes mapped from error codes */
const statusMap: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  SESSION_NOT_FOUND: 404,
  DAEMON_NOT_FOUND: 404,
  DAEMON_ALREADY_EXISTS: 409,
  SNAPSHOT_NOT_FOUND: 404,
  WORKER_NOT_FOUND: 404,
  CAPACITY_EXHAUSTED: 503,
  RATE_LIMITED: 429,
  VALIDATION_ERROR: 400,
  INTERNAL_ERROR: 500,
};

/** Create a GatewayError with auto-resolved HTTP status */
export function gatewayError(code: ErrorCode, message: string, cause?: unknown): GatewayError {
  return new GatewayError(code, message, statusMap[code], cause);
}
