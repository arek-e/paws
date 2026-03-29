import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createServerStore, createSqliteServerStore } from './servers.js';
import { createDatabase } from '../db/index.js';
import type { Server } from '@paws/provisioner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeServer(overrides: Partial<Server> = {}): Server {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'worker-01',
    ip: '10.0.0.1',
    status: 'ready',
    provider: 'manual',
    sshPublicKey: 'ssh-ed25519 AAAA...',
    sshPrivateKeyEncrypted: 'encrypted-data',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createServerStore (in-memory)', () => {
  it('creates and retrieves a server', () => {
    const store = createServerStore();
    const server = makeServer();
    store.create(server);

    const retrieved = store.get(server.id);
    expect(retrieved).toEqual(server);
  });

  it('returns undefined for unknown server', () => {
    const store = createServerStore();
    expect(store.get('nonexistent-id')).toBeUndefined();
  });

  it('lists all servers', () => {
    const store = createServerStore();
    store.create(makeServer({ id: 'id-1', name: 'w1' }));
    store.create(makeServer({ id: 'id-2', name: 'w2' }));

    const servers = store.list();
    expect(servers).toHaveLength(2);
  });

  it('updates a server', () => {
    const store = createServerStore();
    store.create(makeServer());

    const updated = store.update('550e8400-e29b-41d4-a716-446655440000', {
      status: 'error',
      error: 'connection lost',
    });

    expect(updated).toBeDefined();
    expect(updated!.status).toBe('error');
    expect(updated!.error).toBe('connection lost');
    // Unchanged fields preserved
    expect(updated!.name).toBe('worker-01');
  });

  it('update returns undefined for unknown server', () => {
    const store = createServerStore();
    const result = store.update('nonexistent', { status: 'error' });
    expect(result).toBeUndefined();
  });

  it('deletes a server', () => {
    const store = createServerStore();
    store.create(makeServer());

    const deleted = store.delete('550e8400-e29b-41d4-a716-446655440000');
    expect(deleted).toBe(true);
    expect(store.get('550e8400-e29b-41d4-a716-446655440000')).toBeUndefined();
    expect(store.list()).toHaveLength(0);
  });

  it('delete returns false for unknown server', () => {
    const store = createServerStore();
    expect(store.delete('nonexistent')).toBe(false);
  });

  it('overwrites server with same ID', () => {
    const store = createServerStore();
    store.create(makeServer({ name: 'original' }));
    store.create(makeServer({ name: 'replaced' }));

    const server = store.get('550e8400-e29b-41d4-a716-446655440000');
    expect(server!.name).toBe('replaced');
    expect(store.list()).toHaveLength(1);
  });
});

describe('createSqliteServerStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'server-store-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function makeStore() {
    const db = createDatabase(join(dir, 'test.db'));
    return createSqliteServerStore(db);
  }

  it('creates and retrieves a server', () => {
    const store = makeStore();
    store.create(makeServer());

    const retrieved = store.get('550e8400-e29b-41d4-a716-446655440000');
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('worker-01');
    expect(retrieved!.ip).toBe('10.0.0.1');
    expect(retrieved!.status).toBe('ready');
  });

  it('returns undefined for unknown server', () => {
    const store = makeStore();
    expect(store.get('nonexistent-id')).toBeUndefined();
  });

  it('lists all servers', () => {
    const store = makeStore();
    store.create(makeServer({ id: 'id-1', name: 'w1' }));
    store.create(makeServer({ id: 'id-2', name: 'w2' }));

    expect(store.list()).toHaveLength(2);
  });

  it('updates a server', () => {
    const store = makeStore();
    store.create(makeServer());

    const updated = store.update('550e8400-e29b-41d4-a716-446655440000', {
      status: 'error',
      error: 'connection lost',
    });

    expect(updated).toBeDefined();
    expect(updated!.status).toBe('error');
    expect(updated!.error).toBe('connection lost');
    expect(updated!.name).toBe('worker-01');
  });

  it('update returns undefined for unknown server', () => {
    const store = makeStore();
    expect(store.update('nonexistent', { status: 'error' })).toBeUndefined();
  });

  it('deletes a server', () => {
    const store = makeStore();
    store.create(makeServer());

    expect(store.delete('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(store.get('550e8400-e29b-41d4-a716-446655440000')).toBeUndefined();
    expect(store.list()).toHaveLength(0);
  });

  it('delete returns false for unknown server', () => {
    const store = makeStore();
    expect(store.delete('nonexistent')).toBe(false);
  });

  it('persists across store instances', () => {
    const dbPath = join(dir, 'persist.db');
    const db1 = createDatabase(dbPath);
    const store1 = createSqliteServerStore(db1);
    store1.create(makeServer());

    // Create new store from same DB file
    const db2 = createDatabase(dbPath);
    const store2 = createSqliteServerStore(db2);
    expect(store2.list()).toHaveLength(1);
    expect(store2.get('550e8400-e29b-41d4-a716-446655440000')!.name).toBe('worker-01');
  });
});
