import type { S3Client } from '@aws-sdk/client-s3';

/** A single file within a snapshot */
export interface SnapshotFile {
  /** Filename: "disk.ext4", "memory.snap", "vmstate.snap" */
  name: string;
  /** Size in bytes */
  size: number;
  /** SHA-256 hex digest */
  sha256: string;
  /** R2 object key */
  key: string;
}

/** Build configuration that produced a snapshot */
export interface SnapshotBuildConfig {
  baseImage: string;
  setupScript: string;
  packages: string[];
}

/** Manifest describing a snapshot version stored in R2 */
export interface SnapshotManifest {
  /** Snapshot identifier, e.g. "agent-latest" */
  id: string;
  /** Incrementing version number */
  version: number;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** Files comprising this snapshot */
  files: SnapshotFile[];
  /** Optional build configuration that produced the snapshot */
  buildConfig?: SnapshotBuildConfig;
  /** Previous version number for rollback reference */
  previousVersion?: number;
}

/** Configuration for creating a snapshot store */
export interface SnapshotStoreConfig {
  /** R2 / S3 endpoint URL */
  endpoint: string;
  /** AWS-style access key */
  accessKeyId: string;
  /** AWS-style secret key */
  secretAccessKey: string;
  /** Bucket name */
  bucket: string;
  /** Injected S3Client for testability — if omitted, created from config */
  s3Client?: S3Client;
}
