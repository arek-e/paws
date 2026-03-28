import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';
import { z } from '@hono/zod-openapi';

import type { CredentialStore } from '@paws/credentials';
import type { CredentialProvider } from '@paws/credentials';
import type { Provisioner, Server } from '@paws/provisioner';
import type { UpgradeWebSocket } from 'hono/ws';

import type { ServerStore } from '../store/servers.js';

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface SetupDeps {
  serverStore: ServerStore;
  credentialStore: CredentialStore;
  provisioner: Provisioner;
  upgradeWebSocket?: UpgradeWebSocket | undefined;
  /** For first-run: create a session */
  createSession: (prompt: string) => Promise<{ sessionId: string }>;
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const CreateServerBody = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('manual'),
    name: z.string().min(1),
    ip: z.string().min(1),
    password: z.string().min(1),
  }),
  z.object({
    provider: z.literal('aws-ec2'),
    name: z.string().min(1),
    awsAccessKey: z.string().min(1),
    awsSecretKey: z.string().min(1),
    region: z.string().min(1),
  }),
]);

const CredentialBody = z.object({
  provider: z.enum(['anthropic', 'openai', 'github']),
  apiKey: z.string().min(1),
});

const FirstRunBody = z.object({
  prompt: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function createSetupRoutes(deps: SetupDeps) {
  const { serverStore, credentialStore, provisioner, createSession } = deps;

  const app = new Hono();

  // --- POST /v1/setup/servers ---

  app.post('/v1/setup/servers', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = CreateServerBody.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400);
    }

    const body = parsed.data;
    const id = randomUUID();
    const now = new Date().toISOString();

    const server: Server = {
      id,
      name: body.name,
      ip: body.provider === 'manual' ? body.ip : '',
      status: body.provider === 'manual' ? 'waiting_ssh' : 'provisioning',
      provider: body.provider,
      sshPublicKey: '',
      sshPrivateKeyEncrypted: '',
      createdAt: now,
    };

    serverStore.create(server);

    // Fire-and-forget provisioning (background)
    void (async () => {
      try {
        await provisioner.start({
          server,
          ...(body.provider === 'manual' ? { password: body.password } : {}),
          gatewayUrl: process.env['GATEWAY_URL'] ?? 'http://localhost:4000',
          apiKey: process.env['API_KEY'] ?? '',
        });
        serverStore.update(id, { status: 'ready' });
      } catch (err) {
        serverStore.update(id, {
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return c.json({ serverId: id }, 202);
  });

  // --- DELETE /v1/setup/servers/:id ---

  app.delete('/v1/setup/servers/:id', (c) => {
    const id = c.req.param('id');
    if (!serverStore.delete(id)) {
      return c.json(
        { error: { code: 'SERVER_NOT_FOUND', message: `Server ${id} not found` } },
        404,
      );
    }
    return c.json({ serverId: id, status: 'deleted' }, 200);
  });

  // --- GET /v1/setup/servers/:id/stream (WebSocket) ---

  if (deps.upgradeWebSocket) {
    const upgrade = deps.upgradeWebSocket;
    app.get(
      '/v1/setup/servers/:id/stream',
      upgrade((c) => {
        const serverId = c.req.param('id')!;
        return {
          onOpen(_evt, ws) {
            const server = serverStore.get(serverId);
            if (!server) {
              ws.send(JSON.stringify({ type: 'error', message: `Server ${serverId} not found` }));
              ws.close(4004, 'Not found');
              return;
            }
            ws.send(
              JSON.stringify({
                type: 'status',
                serverId: server.id,
                status: server.status,
                name: server.name,
                ip: server.ip,
                error: server.error,
              }),
            );
          },
        };
      }),
    );
  }

  // --- POST /v1/setup/credentials ---

  app.post('/v1/setup/credentials', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = CredentialBody.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400);
    }

    const { provider, apiKey } = parsed.data;
    await credentialStore.upsert(provider, apiKey);
    return c.json({ provider, status: 'configured' }, 200);
  });

  // --- GET /v1/setup/credentials ---

  app.get('/v1/setup/credentials', (c) => {
    return c.json({ credentials: credentialStore.listMasked() }, 200);
  });

  // --- DELETE /v1/setup/credentials/:provider ---

  app.delete('/v1/setup/credentials/:provider', (c) => {
    const provider = c.req.param('provider') as CredentialProvider;
    if (!['anthropic', 'openai', 'github'].includes(provider)) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: `Unknown provider: ${provider}` } },
        400,
      );
    }
    const deleted = credentialStore.delete(provider);
    if (!deleted) {
      return c.json(
        {
          error: { code: 'CREDENTIAL_NOT_FOUND', message: `Credential for ${provider} not found` },
        },
        404,
      );
    }
    return c.json({ provider, status: 'deleted' }, 200);
  });

  // --- POST /v1/setup/first-run ---

  app.post('/v1/setup/first-run', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = FirstRunBody.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400);
    }

    // Check prerequisites: at least one server ready and one credential configured
    const readyServers = serverStore.list().filter((s) => s.status === 'ready');
    const credentials = credentialStore.listMasked();

    if (readyServers.length === 0 || credentials.length === 0) {
      return c.json(
        {
          error: {
            code: 'PREREQUISITES_NOT_MET',
            message:
              readyServers.length === 0 ? 'No server in ready state' : 'No credentials configured',
          },
        },
        409,
      );
    }

    const { prompt } = parsed.data;
    const result = await createSession(prompt);
    return c.json({ sessionId: result.sessionId }, 202);
  });

  return app;
}
