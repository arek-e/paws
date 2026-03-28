export const SnapshotStoreErrorCode = {
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  MANIFEST_NOT_FOUND: 'MANIFEST_NOT_FOUND',
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
  CONFIG_INVALID: 'CONFIG_INVALID',
} as const;

export type SnapshotStoreErrorCode =
  (typeof SnapshotStoreErrorCode)[keyof typeof SnapshotStoreErrorCode];

/** Typed error for snapshot store operations */
export class SnapshotStoreError extends Error {
  readonly code: SnapshotStoreErrorCode;
  readonly cause?: unknown;

  constructor(code: SnapshotStoreErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'SnapshotStoreError';
    this.code = code;
    this.cause = cause;
  }
}
