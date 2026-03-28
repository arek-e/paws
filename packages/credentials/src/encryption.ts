import { createCipheriv, createDecipheriv, randomBytes, hkdf } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = 'paws-credentials';

/**
 * Derive a 256-bit encryption key from the gateway secret using HKDF-SHA256.
 */
export async function deriveKey(secret: string): Promise<Buffer> {
  if (!secret) throw new Error('GATEWAY_SECRET is required for credential encryption');
  return new Promise((resolve, reject) => {
    hkdf('sha256', secret, SALT, 'paws-credential-encryption', KEY_LENGTH, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(Buffer.from(derivedKey));
    });
  });
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns base64(iv + ciphertext + authTag).
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, authTag]).toString('base64');
}

/**
 * Decrypt a base64(iv + ciphertext + authTag) string using AES-256-GCM.
 */
export function decrypt(ciphertext: string, key: Buffer): string {
  const data = Buffer.from(ciphertext, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
