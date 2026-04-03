import { describe, expect, it } from 'vitest';

import { createEnrollmentStore, createWorkerCredentialStore } from './enrollment.js';

describe('EnrollmentStore', () => {
  it('creates and consumes a token', () => {
    const store = createEnrollmentStore();
    const entry = store.create('test-user', 60_000, 'my-worker');

    expect(entry.token).toMatch(/^enroll-/);
    expect(entry.createdBy).toBe('test-user');
    expect(entry.label).toBe('my-worker');

    const consumed = store.consume(entry.token);
    expect(consumed).not.toBeNull();
    expect(consumed!.token).toBe(entry.token);

    // Second consume returns null (one-time use)
    expect(store.consume(entry.token)).toBeNull();
  });

  it('rejects expired tokens', () => {
    const store = createEnrollmentStore();
    const entry = store.create('test', 1); // 1ms TTL

    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* spin */
    }

    expect(store.consume(entry.token)).toBeNull();
  });

  it('lists only non-expired tokens', () => {
    const store = createEnrollmentStore();
    store.create('user', 60_000);
    store.create('user', 60_000);
    store.create('user', 1); // expires immediately

    // Wait for the 1ms token to expire
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* spin */
    }

    expect(store.list()).toHaveLength(2);
  });

  it('prunes expired tokens', () => {
    const store = createEnrollmentStore();
    store.create('user', 1);
    store.create('user', 1);
    store.create('user', 60_000);

    const start = Date.now();
    while (Date.now() - start < 5) {
      /* spin */
    }

    const pruned = store.prune();
    expect(pruned).toBe(2);
    expect(store.list()).toHaveLength(1);
  });
});

describe('WorkerCredentialStore', () => {
  it('adds and retrieves credentials by API key', () => {
    const store = createWorkerCredentialStore();

    store.add({
      workerId: 'worker-1',
      apiKey: 'paws-worker-abc',
      name: 'staging-1',
      createdAt: Date.now(),
      enrolledBy: 'admin',
    });

    const cred = store.getByApiKey('paws-worker-abc');
    expect(cred).toBeDefined();
    expect(cred!.workerId).toBe('worker-1');
    expect(cred!.name).toBe('staging-1');
  });

  it('returns undefined for unknown API key', () => {
    const store = createWorkerCredentialStore();
    expect(store.getByApiKey('nonexistent')).toBeUndefined();
  });

  it('revokes credentials', () => {
    const store = createWorkerCredentialStore();

    store.add({
      workerId: 'worker-1',
      apiKey: 'paws-worker-abc',
      name: 'staging-1',
      createdAt: Date.now(),
      enrolledBy: 'admin',
    });

    expect(store.revoke('worker-1')).toBe(true);
    expect(store.getByApiKey('paws-worker-abc')).toBeUndefined();
    expect(store.list()).toHaveLength(0);
  });

  it('returns false when revoking nonexistent worker', () => {
    const store = createWorkerCredentialStore();
    expect(store.revoke('nonexistent')).toBe(false);
  });
});
