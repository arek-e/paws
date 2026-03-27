import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/**
 * Compute SHA-256 hex digest of a file by streaming it through a hash.
 * Never buffers the entire file in memory.
 */
export function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
