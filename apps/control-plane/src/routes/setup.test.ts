import { describe, expect, test } from 'vitest';

import { createControlPlaneApp } from '../app.js';
import { createServerStore, type ServerStore } from '../store/servers.js';
import type { CredentialStore } from '@paws/credentials';
import type { Server } from '@paws/provisioner';

const API_KEY = 'test-api-key';
const AUTH = { Authorization: `Bearer ${API_KEY}` };
const JSON_HEADERS = { ...AUTH, 'Content-Type': 'application/json' };

function createMockCredentialStore(): CredentialStore {
  const creds = new Map<
    string,
    { masked: string; headerName: string; createdAt: string; updatedAt: string }
  >();

  return {
    async upsert(provider, _apiKey) {
      creds.set(provider, {
        masked: _apiKey.slice(0, 6) + '...' + _apiKey.slice(-4),
        headerName: provider === 'anthropic' ? 'x-api-key' : 'Authorization',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    },
    async get(provider) {
      return creds.has(provider) ? 'decrypted-key' : undefined;
    },
    delete(provider) {
      return creds.delete(provider);
    },
    listMasked() {
      return Array.from(creds.entries()).map(([provider, c]) => ({
        provider: provider as any,
        masked: c.masked,
        headerName: c.headerName,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));
    },
    async rotateKey() {},
    serialize() {
      return [];
    },
    load() {},
  };
}

async function createApp(opts?: { serverStore?: ServerStore; credentialStore?: CredentialStore }) {
  return createControlPlaneApp({
    apiKey: API_KEY,
    serverStore: opts?.serverStore ?? createServerStore(),
    credentialStore: opts?.credentialStore ?? createMockCredentialStore(),
  });
}

// --- Servers ---

describe('POST /v1/setup/servers', () => {
  test('with manual provider returns 202 with serverId', async () => {
    const app = await createApp();
    const res = await app.request('/v1/setup/servers', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        provider: 'manual',
        name: 'test-server',
        ip: '1.2.3.4',
        password: 'secret',
      }),
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.serverId).toBeDefined();
    expect(typeof body.serverId).toBe('string');
  });

  test('with invalid body returns 400', async () => {
    const app = await createApp();
    const res = await app.request('/v1/setup/servers', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ provider: 'manual' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('without auth returns 401', async () => {
    const app = await createApp();
    const res = await app.request('/v1/setup/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'manual',
        name: 'test-server',
        ip: '1.2.3.4',
        password: 'secret',
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /v1/setup/servers/:id', () => {
  test('deletes existing server and returns 200', async () => {
    const serverStore = createServerStore();
    const server: Server = {
      id: 'srv-123',
      name: 'test',
      ip: '1.2.3.4',
      status: 'ready',
      provider: 'manual',
      sshPublicKey: '',
      sshPrivateKeyEncrypted: '',
      createdAt: new Date().toISOString(),
    };
    serverStore.create(server);

    const app = await createApp({ serverStore });
    const res = await app.request('/v1/setup/servers/srv-123', {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.serverId).toBe('srv-123');
    expect(body.status).toBe('deleted');
  });

  test('with unknown id returns 404', async () => {
    const app = await createApp();
    const res = await app.request('/v1/setup/servers/nonexistent', {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('SERVER_NOT_FOUND');
  });
});

// --- Credentials ---

describe('POST /v1/setup/credentials', () => {
  test('with anthropic key returns 200', async () => {
    const app = await createApp();
    const res = await app.request('/v1/setup/credentials', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ provider: 'anthropic', apiKey: 'sk-ant-test-key-123456' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe('anthropic');
    expect(body.status).toBe('configured');
  });

  test('with openai key returns 200', async () => {
    const app = await createApp();
    const res = await app.request('/v1/setup/credentials', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ provider: 'openai', apiKey: 'sk-test-openai-key-456789' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe('openai');
    expect(body.status).toBe('configured');
  });

  test('with invalid provider returns 400', async () => {
    const app = await createApp();
    const res = await app.request('/v1/setup/credentials', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ provider: 'invalid-provider', apiKey: 'some-key' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('DELETE /v1/setup/credentials/:provider', () => {
  test('deletes existing credential and returns 200', async () => {
    const credentialStore = createMockCredentialStore();
    await credentialStore.upsert('anthropic', 'sk-ant-test-key-123456');

    const app = await createApp({ credentialStore });
    const res = await app.request('/v1/setup/credentials/anthropic', {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe('anthropic');
    expect(body.status).toBe('deleted');
  });

  test('with unknown provider returns 404', async () => {
    const app = await createApp();
    const res = await app.request('/v1/setup/credentials/anthropic', {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('CREDENTIAL_NOT_FOUND');
  });
});

describe('GET /v1/setup/credentials', () => {
  test('returns masked list', async () => {
    const credentialStore = createMockCredentialStore();
    await credentialStore.upsert('anthropic', 'sk-ant-test-key-123456');
    await credentialStore.upsert('openai', 'sk-test-openai-key-456789');

    const app = await createApp({ credentialStore });
    const res = await app.request('/v1/setup/credentials', {
      method: 'GET',
      headers: AUTH,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.credentials).toHaveLength(2);
    expect(body.credentials[0].provider).toBe('anthropic');
    expect(body.credentials[0].masked).toBeDefined();
    expect(body.credentials[0]).not.toHaveProperty('encrypted');
  });
});

// --- First Run ---

describe('POST /v1/setup/first-run', () => {
  test('with prompt and prerequisites met returns 202', async () => {
    const serverStore = createServerStore();
    const server: Server = {
      id: 'srv-ready',
      name: 'test',
      ip: '1.2.3.4',
      status: 'ready',
      provider: 'manual',
      sshPublicKey: '',
      sshPrivateKeyEncrypted: '',
      createdAt: new Date().toISOString(),
    };
    serverStore.create(server);

    const credentialStore = createMockCredentialStore();
    await credentialStore.upsert('anthropic', 'sk-ant-test-key-123456');

    const app = await createApp({ serverStore, credentialStore });
    const res = await app.request('/v1/setup/first-run', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ prompt: 'Hello, world!' }),
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.sessionId).toBeDefined();
  });

  test('with no server ready returns 409', async () => {
    const credentialStore = createMockCredentialStore();
    await credentialStore.upsert('anthropic', 'sk-ant-test-key-123456');

    const app = await createApp({ credentialStore });
    const res = await app.request('/v1/setup/first-run', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ prompt: 'Hello, world!' }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('PREREQUISITES_NOT_MET');
  });
});
