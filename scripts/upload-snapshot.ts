#!/usr/bin/env bun
/**
 * Upload a local snapshot directory to R2.
 *
 * Usage: bun run scripts/upload-snapshot.ts <snapshot-id> <local-dir>
 *
 * Env vars: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 *
 * Reads snapshot files (disk.ext4, memory.snap, vmstate.snap), computes SHA-256
 * checksums, uploads each file to R2, and publishes a new manifest with an
 * incremented version number.
 */

import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

// --- Config ------------------------------------------------------------------

const SNAPSHOT_FILES = ['disk.ext4', 'memory.snap', 'vmstate.snap'] as const;

interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

interface SnapshotManifest {
  id: string;
  version: number;
  files: Record<string, { sha256: string; size: number }>;
  createdAt: string;
}

// --- Helpers -----------------------------------------------------------------

function die(msg: string): never {
  console.error(`[paws] ERROR: ${msg}`);
  process.exit(1);
}

function info(msg: string): void {
  console.log(`[paws] ${msg}`);
}

function getR2Config(): R2Config {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;

  if (!endpoint) die('R2_ENDPOINT not set');
  if (!accessKeyId) die('R2_ACCESS_KEY_ID not set');
  if (!secretAccessKey) die('R2_SECRET_ACCESS_KEY not set');
  if (!bucket) die('R2_BUCKET_NAME not set');

  return { endpoint, accessKeyId, secretAccessKey, bucket };
}

/** Compute SHA-256 of a file, streaming to avoid loading into memory */
async function computeFileSha256(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const stream = file.stream();
  const hasher = createHash('sha256');

  for await (const chunk of stream) {
    hasher.update(chunk);
  }

  return hasher.digest('hex');
}

/** Create an S3-compatible client for R2 using AWS Signature V4 (via Bun's S3 support) */
function createR2Client(config: R2Config) {
  // Use the S3 client built into Bun (available since Bun 1.2+)
  // Falls back to raw fetch with presigned URLs if unavailable
  const baseUrl = `${config.endpoint}/${config.bucket}`;

  async function putObject(
    key: string,
    body: ReadableStream | Buffer | Uint8Array,
    contentLength?: number,
  ): Promise<void> {
    // Use AWS SDK-compatible S3 API via fetch
    // Bun supports S3 natively but for maximum compatibility we use the S3 API directly
    const url = `${baseUrl}/${key}`;

    // We use Bun's built-in S3 support for signing
    const { S3Client } = await import('@aws-sdk/client-s3');
    const { Upload } = await import('@aws-sdk/lib-storage');

    const s3 = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });

    const upload = new Upload({
      client: s3,
      params: {
        Bucket: config.bucket,
        Key: key,
        Body: body,
      },
      // 100MB parts for large snapshot files
      partSize: 100 * 1024 * 1024,
      leavePartsOnError: false,
    });

    upload.on('httpUploadProgress', (progress) => {
      if (progress.loaded && progress.total) {
        const pct = ((progress.loaded / progress.total) * 100).toFixed(1);
        process.stdout.write(`\r[paws]   ${key}: ${pct}%`);
      }
    });

    await upload.done();
    process.stdout.write('\n');
  }

  async function getObject(key: string): Promise<string | null> {
    try {
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');

      const s3 = new S3Client({
        region: 'auto',
        endpoint: config.endpoint,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        forcePathStyle: true,
      });

      const response = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));

      return (await response.Body?.transformToString()) ?? null;
    } catch {
      return null;
    }
  }

  return { putObject, getObject };
}

// --- Main --------------------------------------------------------------------

async function main() {
  const [snapshotId, localDir] = process.argv.slice(2);

  if (!snapshotId || !localDir) {
    die('Usage: bun run scripts/upload-snapshot.ts <snapshot-id> <local-dir>');
  }

  // Verify local directory exists
  try {
    const s = await stat(localDir);
    if (!s.isDirectory()) die(`${localDir} is not a directory`);
  } catch {
    die(`Directory not found: ${localDir}`);
  }

  // Verify all snapshot files exist
  const files = await readdir(localDir);
  for (const f of SNAPSHOT_FILES) {
    if (!files.includes(f)) {
      die(`Missing snapshot file: ${join(localDir, f)}`);
    }
  }

  const r2Config = getR2Config();
  const client = createR2Client(r2Config);

  info(`Uploading snapshot '${snapshotId}' from ${localDir}`);

  // Step 1: Compute checksums
  info('Computing SHA-256 checksums...');
  const fileChecksums: Record<string, { sha256: string; size: number }> = {};

  for (const filename of SNAPSHOT_FILES) {
    const filePath = join(localDir, filename);
    const fileStat = await stat(filePath);
    const sha256 = await computeFileSha256(filePath);
    fileChecksums[filename] = { sha256, size: fileStat.size };
    info(`  ${filename}: ${sha256} (${(fileStat.size / 1024 / 1024).toFixed(1)} MB)`);
  }

  // Step 2: Get current manifest to determine version
  const manifestKey = `snapshots/${snapshotId}/manifest.json`;
  const existingManifest = await client.getObject(manifestKey);
  let currentVersion = 0;
  if (existingManifest) {
    try {
      const parsed = JSON.parse(existingManifest) as SnapshotManifest;
      currentVersion = parsed.version;
      info(`Current manifest version: ${currentVersion}`);
    } catch {
      info('Could not parse existing manifest, starting from version 0');
    }
  } else {
    info('No existing manifest found, starting from version 1');
  }

  const newVersion = currentVersion + 1;
  info(`New version: ${newVersion}`);

  // Step 3: Upload files
  info('Uploading files to R2...');
  for (const filename of SNAPSHOT_FILES) {
    const filePath = join(localDir, filename);
    const key = `snapshots/${snapshotId}/v${newVersion}/${filename}`;
    const file = Bun.file(filePath);
    const buffer = await file.arrayBuffer();

    info(`  Uploading ${key}...`);
    await client.putObject(key, Buffer.from(buffer));
  }

  // Step 4: Publish new manifest
  const manifest: SnapshotManifest = {
    id: snapshotId,
    version: newVersion,
    files: fileChecksums,
    createdAt: new Date().toISOString(),
  };

  const manifestBody = JSON.stringify(manifest, null, 2);
  await client.putObject(manifestKey, Buffer.from(manifestBody));
  info(`Manifest published: ${manifestKey}`);

  // Step 5: Summary
  console.log('');
  info('Upload complete!');
  info(`  Snapshot: ${snapshotId}`);
  info(`  Version:  ${newVersion}`);
  info(`  Files:`);
  for (const filename of SNAPSHOT_FILES) {
    const f = fileChecksums[filename];
    info(`    ${filename}: ${f.sha256.slice(0, 16)}... (${(f.size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

main().catch((e) => {
  die(`Unexpected error: ${e}`);
});
