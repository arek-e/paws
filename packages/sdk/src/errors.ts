import type { ErrorCode, ErrorResponse } from '@paws/types';

/** Typed error returned by the paws API */
export class PawsApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(status: number, body: ErrorResponse) {
    super(body.error.message);
    this.name = 'PawsApiError';
    this.code = body.error.code;
    this.status = status;
  }
}

/** Network-level error (fetch failed, timeout, DNS, etc.) */
export class PawsNetworkError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'PawsNetworkError';
    this.cause = cause;
  }
}
