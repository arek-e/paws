import { describe, test, expect } from 'vitest';
import { createCredentialStore } from './store.js';

const TEST_SECRET = 'test-secret-for-unit-tests';

describe('createCredentialStore', () => {
  test('upsert creates new credential, listMasked shows it', async () => {
    const store = createCredentialStore(TEST_SECRET);
    await store.upsert('anthropic', 'sk-ant-api03-abcdefghij1234567890');

    const masked = store.listMasked();
    expect(masked).toHaveLength(1);
    expect(masked[0]!.provider).toBe('anthropic');
    expect(masked[0]!.masked).toBe('sk-ant...7890');
    expect(masked[0]!.headerName).toBe('x-api-key');
    expect(masked[0]!.createdAt).toBeTruthy();
    expect(masked[0]!.updatedAt).toBeTruthy();
  });

  test('upsert updates existing credential, preserves createdAt', async () => {
    const store = createCredentialStore(TEST_SECRET);
    await store.upsert('openai', 'sk-old-key-1234');

    const before = store.listMasked();
    const createdAt = before[0]!.createdAt;

    // Small delay to ensure updatedAt differs
    await new Promise((r) => setTimeout(r, 10));
    await store.upsert('openai', 'sk-new-key-5678');

    const after = store.listMasked();
    expect(after).toHaveLength(1);
    expect(after[0]!.createdAt).toBe(createdAt);
    expect(after[0]!.masked).toBe('sk-new...5678');
  });

  test('get returns decrypted value', async () => {
    const store = createCredentialStore(TEST_SECRET);
    const apiKey = 'sk-ant-api03-my-secret-key-xyz';
    await store.upsert('anthropic', apiKey);

    const result = await store.get('anthropic');
    expect(result).toBe(apiKey);
  });

  test('get returns undefined for missing provider', async () => {
    const store = createCredentialStore(TEST_SECRET);
    const result = await store.get('github');
    expect(result).toBeUndefined();
  });

  test('delete removes credential', async () => {
    const store = createCredentialStore(TEST_SECRET);
    await store.upsert('github', 'ghp_abc123def456ghi789');

    expect(store.listMasked()).toHaveLength(1);
    const deleted = store.delete('github');
    expect(deleted).toBe(true);
    expect(store.listMasked()).toHaveLength(0);

    const deletedAgain = store.delete('github');
    expect(deletedAgain).toBe(false);
  });

  test('rotateKey re-encrypts all credentials, values still accessible', async () => {
    const store = createCredentialStore(TEST_SECRET);
    const anthropicKey = 'sk-ant-api03-rotate-test-key';
    const openaiKey = 'sk-openai-rotate-test-key-9999';

    await store.upsert('anthropic', anthropicKey);
    await store.upsert('openai', openaiKey);

    const serializedBefore = store.serialize();
    const encryptedBefore = serializedBefore.map((c) => c.encrypted);

    const newSecret = 'rotated-secret-new';
    await store.rotateKey(newSecret);

    // Encrypted values should have changed
    const serializedAfter = store.serialize();
    const encryptedAfter = serializedAfter.map((c) => c.encrypted);
    expect(encryptedAfter[0]).not.toBe(encryptedBefore[0]);
    expect(encryptedAfter[1]).not.toBe(encryptedBefore[1]);

    // But decrypted values are still correct
    const result1 = await store.get('anthropic');
    const result2 = await store.get('openai');
    expect(result1).toBe(anthropicKey);
    expect(result2).toBe(openaiKey);
  });
});
