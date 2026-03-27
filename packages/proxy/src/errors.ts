export const ProxyErrorCode = {
  CA_FAILED: 'CA_FAILED',
  START_FAILED: 'START_FAILED',
  UPSTREAM_FAILED: 'UPSTREAM_FAILED',
  CONFIG_INVALID: 'CONFIG_INVALID',
} as const;

export type ProxyErrorCode = (typeof ProxyErrorCode)[keyof typeof ProxyErrorCode];

/** Typed error for proxy operations */
export class ProxyError extends Error {
  readonly code: ProxyErrorCode;
  readonly cause?: unknown;

  constructor(code: ProxyErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ProxyError';
    this.code = code;
    this.cause = cause;
  }
}
