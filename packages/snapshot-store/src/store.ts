import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { Readable } from 'node:stream';
import { ResultAsync } from 'neverthrow';

import { SnapshotStoreError, SnapshotStoreErrorCode } from './errors.js';
import type { SnapshotManifest, SnapshotStoreConfig } from './types.js';

/** Threshold for multipart upload (100 MB) */
const MULTIPART_THRESHOLD = 100 * 1024 * 1024;

/** Part size for multipart uploads (64 MB) */
const MULTIPART_PART_SIZE = 64 * 1024 * 1024;

function buildClient(config: SnapshotStoreConfig): S3Client {
  if (config.s3Client) return config.s3Client;
  return new S3Client({
    endpoint: config.endpoint,
    region: 'auto',
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });
}

function wrapError(code: SnapshotStoreErrorCode, label: string, e: unknown): SnapshotStoreError {
  if (e instanceof SnapshotStoreError) return e;
  return new SnapshotStoreError(code, `${label}: ${e}`, e);
}

/**
 * Create a snapshot store backed by S3-compatible storage (Cloudflare R2).
 * Accepts an optional injected S3Client for testability.
 */
export function createSnapshotStore(config: SnapshotStoreConfig) {
  const client = buildClient(config);
  const { bucket } = config;

  return {
    /** Retrieve the current manifest for a snapshot ID */
    getManifest(id: string): ResultAsync<SnapshotManifest, SnapshotStoreError> {
      const key = `snapshots/${id}/manifest.json`;
      return ResultAsync.fromPromise(
        (async () => {
          const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
          const body = await res.Body?.transformToString();
          if (!body) {
            throw new SnapshotStoreError(
              SnapshotStoreErrorCode.MANIFEST_NOT_FOUND,
              `Manifest body empty for ${id}`,
            );
          }
          try {
            return JSON.parse(body) as SnapshotManifest;
          } catch (cause) {
            throw new SnapshotStoreError(
              SnapshotStoreErrorCode.DOWNLOAD_FAILED,
              `Malformed manifest JSON for ${id}`,
              cause,
            );
          }
        })(),
        (e) => {
          if (e instanceof SnapshotStoreError) return e;
          const err = e as { name?: string };
          if (err.name === 'NoSuchKey' || err.name === 'NotFound') {
            return new SnapshotStoreError(
              SnapshotStoreErrorCode.MANIFEST_NOT_FOUND,
              `Manifest not found for ${id}`,
              e,
            );
          }
          return wrapError(SnapshotStoreErrorCode.DOWNLOAD_FAILED, `getManifest(${id})`, e);
        },
      );
    },

    /** Write a manifest (both as current and versioned copy) */
    putManifest(manifest: SnapshotManifest): ResultAsync<void, SnapshotStoreError> {
      const currentKey = `snapshots/${manifest.id}/manifest.json`;
      const versionKey = `snapshots/${manifest.id}/manifests/v${manifest.version}.json`;
      const body = JSON.stringify(manifest, null, 2);

      return ResultAsync.fromPromise(
        (async () => {
          await Promise.all([
            client.send(
              new PutObjectCommand({
                Bucket: bucket,
                Key: currentKey,
                Body: body,
                ContentType: 'application/json',
              }),
            ),
            client.send(
              new PutObjectCommand({
                Bucket: bucket,
                Key: versionKey,
                Body: body,
                ContentType: 'application/json',
              }),
            ),
          ]);
        })(),
        (e) => wrapError(SnapshotStoreErrorCode.UPLOAD_FAILED, 'putManifest', e),
      );
    },

    /**
     * Upload a file from disk to R2.
     * Uses multipart upload for files larger than 100 MB.
     * Returns the SHA-256 hex digest computed during the upload stream.
     */
    uploadFile(key: string, filePath: string): ResultAsync<string, SnapshotStoreError> {
      return ResultAsync.fromPromise(
        (async () => {
          const fileStats = await stat(filePath);
          const hash = createHash('sha256');
          const fileStream = createReadStream(filePath);

          // Pipe through a transform that computes SHA-256 while passing data through
          const hashTransform = new Transform({
            transform(chunk, _encoding, callback) {
              hash.update(chunk);
              callback(null, chunk);
            },
          });

          const hashedStream = fileStream.pipe(hashTransform);

          if (fileStats.size > MULTIPART_THRESHOLD) {
            // Multipart upload for large files
            const upload = new Upload({
              client,
              params: {
                Bucket: bucket,
                Key: key,
                Body: hashedStream,
                ContentLength: fileStats.size,
              },
              partSize: MULTIPART_PART_SIZE,
              leavePartsOnError: false,
            });
            await upload.done();
          } else {
            // Single PUT for smaller files
            // We need to collect the stream since PutObject needs the full body
            const chunks: Buffer[] = [];
            for await (const chunk of hashedStream) {
              chunks.push(chunk as Buffer);
            }
            const buffer = Buffer.concat(chunks);
            await client.send(
              new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: buffer,
                ContentLength: fileStats.size,
              }),
            );
          }

          return hash.digest('hex');
        })(),
        (e) => wrapError(SnapshotStoreErrorCode.UPLOAD_FAILED, `uploadFile(${key})`, e),
      );
    },

    /**
     * Download a file from R2 to disk.
     * If expectedSha256 is provided, verify the checksum during streaming.
     * On mismatch, deletes the partial file and returns an error.
     */
    downloadFile(
      key: string,
      destPath: string,
      expectedSha256?: string,
    ): ResultAsync<string, SnapshotStoreError> {
      return ResultAsync.fromPromise(
        (async () => {
          const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

          if (!res.Body) {
            throw new SnapshotStoreError(
              SnapshotStoreErrorCode.DOWNLOAD_FAILED,
              `Empty body for key ${key}`,
            );
          }

          const hash = createHash('sha256');
          const hashTransform = new Transform({
            transform(chunk, _encoding, callback) {
              hash.update(chunk);
              callback(null, chunk);
            },
          });

          const bodyStream =
            res.Body instanceof Readable
              ? res.Body
              : Readable.fromWeb(res.Body as import('node:stream/web').ReadableStream);

          const writeStream = createWriteStream(destPath);
          await pipeline(bodyStream, hashTransform, writeStream);

          const actualSha256 = hash.digest('hex');

          if (expectedSha256 && actualSha256 !== expectedSha256) {
            // Clean up the mismatched file
            await unlink(destPath).catch(() => {});
            throw new SnapshotStoreError(
              SnapshotStoreErrorCode.CHECKSUM_MISMATCH,
              `Checksum mismatch for ${key}: expected ${expectedSha256}, got ${actualSha256}`,
            );
          }

          return actualSha256;
        })(),
        (e) => {
          if (e instanceof SnapshotStoreError) return e;
          const err = e as { name?: string };
          if (err.name === 'NoSuchKey' || err.name === 'NotFound') {
            return new SnapshotStoreError(
              SnapshotStoreErrorCode.DOWNLOAD_FAILED,
              `Object not found: ${key}`,
              e,
            );
          }
          return wrapError(SnapshotStoreErrorCode.DOWNLOAD_FAILED, `downloadFile(${key})`, e);
        },
      );
    },

    /** List all versioned manifests for a snapshot ID, sorted by version ascending */
    listVersions(id: string): ResultAsync<SnapshotManifest[], SnapshotStoreError> {
      const prefix = `snapshots/${id}/manifests/`;
      return ResultAsync.fromPromise(
        (async () => {
          const res = await client.send(
            new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: prefix,
            }),
          );

          const contents = res.Contents ?? [];
          if (contents.length === 0) return [];

          // Fetch each versioned manifest
          const manifests = await Promise.all(
            contents.map(async (obj) => {
              const getRes = await client.send(
                new GetObjectCommand({ Bucket: bucket, Key: obj.Key }),
              );
              const body = await getRes.Body?.transformToString();
              if (!body) return null;
              try {
                return JSON.parse(body) as SnapshotManifest;
              } catch {
                return null;
              }
            }),
          );

          return manifests
            .filter((m): m is SnapshotManifest => m !== null)
            .sort((a, b) => a.version - b.version);
        })(),
        (e) => wrapError(SnapshotStoreErrorCode.DOWNLOAD_FAILED, `listVersions(${id})`, e),
      );
    },
  };
}

export type SnapshotStore = ReturnType<typeof createSnapshotStore>;
