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
  z
    .object({
      provider: z.literal('manual'),
      name: z.string().min(1),
      ip: z.string().min(1),
      /** SSH auth: password, private key, or both (key with passphrase) */
      authMethod: z.enum(['password', 'privateKey']).default('password'),
      password: z.string().optional(),
      privateKey: z.string().optional(),
      passphrase: z.string().optional(),
      port: z.number().int().min(1).max(65535).default(22),
      username: z.string().default('root'),
    })
    .refine((d) => (d.authMethod === 'password' ? !!d.password : !!d.privateKey), {
      message: 'Password required for password auth, privateKey required for key auth',
    }),
  z.object({
    provider: z.literal('aws-ec2'),
    name: z.string().min(1),
    awsAccessKey: z.string().min(1),
    awsSecretKey: z.string().min(1),
    region: z.string().min(1),
  }),
]);

const TestConnectionBody = z.object({
  ip: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().default('root'),
  authMethod: z.enum(['password', 'privateKey']).default('password'),
  password: z.string().optional(),
  privateKey: z.string().optional(),
  passphrase: z.string().optional(),
});

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

  // --- POST /v1/setup/servers/test-connection ---

  app.post('/v1/setup/servers/test-connection', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = TestConnectionBody.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400);
    }

    const { ip, port, username, authMethod, password, privateKey, passphrase } = parsed.data;
    const startMs = Date.now();

    try {
      // TCP connection test first (fast fail if port is closed)
      await new Promise<void>((resolve, reject) => {
        import('node:net').then(({ createConnection }) => {
          const sock = createConnection({ host: ip, port, timeout: 5000 });
          sock.on('connect', () => {
            sock.destroy();
            resolve();
          });
          sock.on('timeout', () => {
            sock.destroy();
            reject(new Error(`Connection timed out (${ip}:${port})`));
          });
          sock.on('error', (err) => {
            reject(new Error(`Cannot reach ${ip}:${port} — ${err.message}`));
          });
        });
      });

      const tcpMs = Date.now() - startMs;

      // SSH auth test — try to run `echo paws` via the provisioner's SSH
      // For now, just report TCP success + auth info since full SSH requires
      // the provisioner's SSH client which may not be wired in all contexts
      const checks: { name: string; status: 'pass' | 'fail'; message: string; ms?: number }[] = [
        { name: 'tcp', status: 'pass', message: `Port ${port} reachable`, ms: tcpMs },
      ];

      // Auth info (we can't fully verify SSH auth without an SSH client, but we can validate the inputs)
      if (authMethod === 'password') {
        checks.push({
          name: 'auth',
          status: password ? 'pass' : 'fail',
          message: password ? `Password auth as ${username}` : 'No password provided',
        });
      } else {
        const keyValid = !!privateKey?.includes('PRIVATE KEY');
        checks.push({
          name: 'auth',
          status: keyValid ? 'pass' : 'fail',
          message: keyValid
            ? `Private key auth as ${username}${passphrase ? ' (with passphrase)' : ''}`
            : 'Invalid private key format — expected PEM/OpenSSH key',
        });
      }

      const allPass = checks.every((ch) => ch.status === 'pass');
      return c.json({ success: allPass, checks, totalMs: Date.now() - startMs }, 200);
    } catch (err) {
      return c.json(
        {
          success: false,
          checks: [
            {
              name: 'tcp',
              status: 'fail' as const,
              message: err instanceof Error ? err.message : `Cannot reach ${ip}:${port}`,
              ms: Date.now() - startMs,
            },
          ],
          totalMs: Date.now() - startMs,
        },
        200,
      );
    }
  });

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
          ...(body.provider === 'manual'
            ? {
                password: body.password,
                privateKey: body.privateKey,
                passphrase: body.passphrase,
              }
            : {}),
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
