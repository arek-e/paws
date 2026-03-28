import { describe, test, expect } from 'vitest';
import { deriveKey, encrypt, decrypt } from './encryption.js';

const TEST_SECRET = 'test-secret-for-unit-tests';

describe('deriveKey', () => {
  test('returns a 32-byte buffer', async () => {
    const key = await deriveKey(TEST_SECRET);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  test('throws on empty secret', async () => {
    await expect(deriveKey('')).rejects.toThrow('GATEWAY_SECRET is required');
  });

  test('is deterministic — same secret produces same key', async () => {
    const key1 = await deriveKey(TEST_SECRET);
    const key2 = await deriveKey(TEST_SECRET);
    expect(key1.equals(key2)).toBe(true);
  });
});

describe('encrypt', () => {
  test('returns a base64 string', async () => {
    const key = await deriveKey(TEST_SECRET);
    const result = encrypt('hello world', key);
    expect(typeof result).toBe('string');
    // Verify it's valid base64 by round-tripping
    expect(Buffer.from(result, 'base64').toString('base64')).toBe(result);
  });
});

describe('encrypt/decrypt', () => {
  test('round-trip preserves plaintext', async () => {
    const key = await deriveKey(TEST_SECRET);
    const plaintext = 'sk-ant-api03-super-secret-key-12345';
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  test('decrypt with wrong key throws', async () => {
    const key1 = await deriveKey(TEST_SECRET);
    const key2 = await deriveKey('different-secret');
    const encrypted = encrypt('secret data', key1);
    expect(() => decrypt(encrypted, key2)).toThrow();
  });

  test('decrypt with tampered ciphertext throws', async () => {
    const key = await deriveKey(TEST_SECRET);
    const encrypted = encrypt('secret data', key);
    // Tamper with the ciphertext by flipping a byte in the middle
    const buf = Buffer.from(encrypted, 'base64');
    const idx = Math.floor(buf.length / 2);
    buf[idx] = (buf[idx] ?? 0) ^ 0xff;
    const tampered = buf.toString('base64');
    expect(() => decrypt(tampered, key)).toThrow();
  });

  test('decrypt with invalid base64 throws', async () => {
    const key = await deriveKey(TEST_SECRET);
    // Too short to contain iv + authTag
    expect(() => decrypt('aGVsbG8=', key)).toThrow();
  });
});
