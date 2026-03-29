import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';
import { z } from '@hono/zod-openapi';

import type { Provisioner, Server } from '@paws/provisioner';
import type { UpgradeWebSocket } from 'hono/ws';

import type { ServerStore } from '../store/servers.js';

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface ProvisioningDeps {
  serverStore: ServerStore;
  provisioner: Provisioner;
  upgradeWebSocket?: UpgradeWebSocket | undefined;
}

// ---------------------------------------------------------------------------
// Provider field definitions
// ---------------------------------------------------------------------------

interface ProviderField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'select';
  placeholder?: string;
  options?: { value: string; label: string }[];
  hint?: string;
}

interface ProviderDefinition {
  name: string;
  label: string;
  description: string;
  fields: ProviderField[];
}

const PROVIDERS: ProviderDefinition[] = [
  {
    name: 'manual',
    label: 'Bring Your Own',
    description: 'Connect an existing server via SSH',
    fields: [
      { name: 'ip', label: 'IP Address', type: 'text', placeholder: '168.119.x.x' },
      {
        name: 'password',
        label: 'Root Password',
        type: 'password',
        placeholder: 'Used for initial SSH access only',
        hint: "We'll install our own SSH key and discard this credential.",
      },
    ],
  },
  {
    name: 'hetzner-cloud',
    label: 'Hetzner Cloud',
    description: 'Provision a Hetzner Cloud server with nested virtualization',
    fields: [
      {
        name: 'token',
        label: 'API Token',
        type: 'password',
        placeholder: 'Your Hetzner API token',
      },
      {
        name: 'region',
        label: 'Region',
        type: 'select',
        options: [
          { value: 'fsn1', label: 'Falkenstein (fsn1)' },
          { value: 'nbg1', label: 'Nuremberg (nbg1)' },
          { value: 'hel1', label: 'Helsinki (hel1)' },
          { value: 'ash', label: 'Ashburn (ash)' },
          { value: 'hil', label: 'Hillsboro (hil)' },
        ],
      },
    ],
  },
  {
    name: 'aws-ec2',
    label: 'AWS EC2',
    description: 'Provision a bare-metal EC2 instance with /dev/kvm',
    fields: [
      { name: 'accessKey', label: 'Access Key ID', type: 'text', placeholder: 'AKIA...' },
      {
        name: 'secretKey',
        label: 'Secret Access Key',
        type: 'password',
        placeholder: 'Your secret key',
      },
      {
        name: 'region',
        label: 'Region',
        type: 'select',
        options: [
          { value: 'us-east-1', label: 'US East (N. Virginia)' },
          { value: 'us-west-2', label: 'US West (Oregon)' },
          { value: 'eu-west-1', label: 'EU (Ireland)' },
          { value: 'eu-central-1', label: 'EU (Frankfurt)' },
          { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ProvisionBody = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('manual'),
    name: z.string().min(1),
    ip: z.string().min(1),
    password: z.string().min(1),
  }),
  z.object({
    provider: z.literal('hetzner-cloud'),
    name: z.string().min(1),
    token: z.string().min(1),
    region: z.string().min(1),
  }),
  z.object({
    provider: z.literal('aws-ec2'),
    name: z.string().min(1),
    accessKey: z.string().min(1),
    secretKey: z.string().min(1),
    region: z.string().min(1),
  }),
]);

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function createProvisioningRoutes(deps: ProvisioningDeps) {
  const { serverStore, provisioner } = deps;

  const app = new Hono();

  // --- GET /v1/provisioning/providers ---
  app.get('/v1/provisioning/providers', (c) => {
    return c.json({ providers: PROVIDERS });
  });

  // --- POST /v1/provisioning/provision ---
  app.post('/v1/provisioning/provision', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = ProvisionBody.safeParse(raw);
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
      provider: body.provider === 'hetzner-cloud' ? 'manual' : body.provider,
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

  // --- GET /v1/provisioning/:id/status ---
  app.get('/v1/provisioning/:id/status', (c) => {
    const id = c.req.param('id');
    const server = serverStore.get(id);
    if (!server) {
      return c.json(
        { error: { code: 'SERVER_NOT_FOUND', message: `Server ${id} not found` } },
        404,
      );
    }
    return c.json({
      serverId: server.id,
      name: server.name,
      ip: server.ip,
      status: server.status,
      provider: server.provider,
      error: server.error,
      createdAt: server.createdAt,
    });
  });

  // --- GET /v1/provisioning/:id/stream (WebSocket) ---
  if (deps.upgradeWebSocket) {
    const upgrade = deps.upgradeWebSocket;
    app.get(
      '/v1/provisioning/:id/stream',
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

  return app;
}
