import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

import { computeFileSha256 } from './checksum.js';

describe('computeFileSha256', () => {
  let dir: string;

  function tmpFile(name: string, content: string | Buffer): string {
    const path = join(dir, name);
    writeFileSync(path, content);
    return path;
  }

  function expectedSha256(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }

  // Create and clean up temp directory per suite
  dir = mkdtempSync(join(tmpdir(), 'checksum-test-'));

  it('computes correct SHA-256 for a text file', async () => {
    const content = 'hello world\n';
    const path = tmpFile('hello.txt', content);
    const hash = await computeFileSha256(path);
    expect(hash).toBe(expectedSha256(content));
  });

  it('computes correct SHA-256 for an empty file', async () => {
    const path = tmpFile('empty.txt', '');
    const hash = await computeFileSha256(path);
    // SHA-256 of empty input is a well-known constant
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('computes correct SHA-256 for binary data', async () => {
    const content = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
    const path = tmpFile('binary.bin', content);
    const hash = await computeFileSha256(path);
    expect(hash).toBe(expectedSha256(content));
  });

  it('returns a 64-character hex string', async () => {
    const path = tmpFile('length.txt', 'test');
    const hash = await computeFileSha256(path);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects for non-existent file', async () => {
    await expect(computeFileSha256(join(dir, 'nonexistent.txt'))).rejects.toThrow();
  });

  it('produces different hashes for different content', async () => {
    const path1 = tmpFile('a.txt', 'content A');
    const path2 = tmpFile('b.txt', 'content B');
    const hash1 = await computeFileSha256(path1);
    const hash2 = await computeFileSha256(path2);
    expect(hash1).not.toBe(hash2);
  });

  it('produces same hash for same content in different files', async () => {
    const content = 'identical content';
    const path1 = tmpFile('same1.txt', content);
    const path2 = tmpFile('same2.txt', content);
    const hash1 = await computeFileSha256(path1);
    const hash2 = await computeFileSha256(path2);
    expect(hash1).toBe(hash2);
  });
});
