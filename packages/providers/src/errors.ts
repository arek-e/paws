/** Error codes for providers package operations */
export const ProvidersErrorCode = {
  PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
  HOST_NOT_FOUND: 'HOST_NOT_FOUND',
  PROVISION_FAILED: 'PROVISION_FAILED',
  API_ERROR: 'API_ERROR',
  INVALID_CONFIG: 'INVALID_CONFIG',
} as const;

export type ProvidersErrorCode = (typeof ProvidersErrorCode)[keyof typeof ProvidersErrorCode];

/** Typed error for all providers package operations */
export class ProvidersError extends Error {
  readonly code: ProvidersErrorCode;
  readonly cause?: unknown;

  constructor(code: ProvidersErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ProvidersError';
    this.code = code;
    this.cause = cause;
  }
}
