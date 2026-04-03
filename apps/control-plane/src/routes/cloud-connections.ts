import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';
import { z } from '@hono/zod-openapi';

import { encrypt, decrypt } from '@paws/credentials';
import { createLogger } from '@paws/logger';
import { createAwsEc2Provider } from '@paws/provider-aws-ec2';

import type { CloudConnectionStore } from '../store/cloud-connections.js';

const log = createLogger('cloud-connections');

export interface CloudConnectionDeps {
  connectionStore: CloudConnectionStore;
  encryptionKey: Buffer;
}

const CreateConnectionBody = z.object({
  provider: z.literal('aws-ec2'),
  name: z.string().min(1),
  region: z.string().min(1),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
});

export function createCloudConnectionRoutes(deps: CloudConnectionDeps) {
  const { connectionStore, encryptionKey } = deps;
  const app = new Hono();

  // --- GET /v1/cloud-connections ---
  app.get('/v1/cloud-connections', (c) => {
    const connections = connectionStore.list().map((conn) => ({
      id: conn.id,
      provider: conn.provider,
      name: conn.name,
      region: conn.region,
      status: conn.status,
      error: conn.error,
      lastSyncAt: conn.lastSyncAt,
      createdAt: conn.createdAt,
    }));
    return c.json({ connections });
  });

  // --- POST /v1/cloud-connections ---
  app.post('/v1/cloud-connections', async (c) => {
    const body = CreateConnectionBody.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: body.error.message } }, 400);
    }

    const { provider, name, region, accessKeyId, secretAccessKey } = body.data;

    // Validate credentials by trying to list instances
    log.info('Validating AWS credentials', { region, name });
    const ec2 = createAwsEc2Provider({
      region,
      defaultImageId: '',
      credentials: { accessKeyId, secretAccessKey },
    });

    const testResult = await ec2.listHosts();
    if (testResult.isErr()) {
      log.warn('AWS credential validation failed', { error: testResult.error.message });
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: `AWS credentials invalid: ${testResult.error.message}`,
          },
        },
        400,
      );
    }

    const id = randomUUID();
    const encryptedCreds = encrypt(JSON.stringify({ accessKeyId, secretAccessKey }), encryptionKey);

    connectionStore.create({
      id,
      provider,
      name,
      region,
      credentialsEncrypted: encryptedCreds,
      status: 'connected',
      createdAt: new Date().toISOString(),
    });

    log.info('Cloud connection created', {
      id,
      provider,
      region,
      name,
      existingInstances: testResult.value.length,
    });

    return c.json(
      {
        id,
        provider,
        name,
        region,
        status: 'connected',
        existingInstances: testResult.value.length,
      },
      201,
    );
  });

  // --- GET /v1/cloud-connections/:id ---
  app.get('/v1/cloud-connections/:id', (c) => {
    const conn = connectionStore.get(c.req.param('id'));
    if (!conn) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Connection not found' } }, 404);
    }
    return c.json({
      id: conn.id,
      provider: conn.provider,
      name: conn.name,
      region: conn.region,
      status: conn.status,
      error: conn.error,
      lastSyncAt: conn.lastSyncAt,
      createdAt: conn.createdAt,
    });
  });

  // --- DELETE /v1/cloud-connections/:id ---
  app.delete('/v1/cloud-connections/:id', (c) => {
    const id = c.req.param('id');
    if (!connectionStore.delete(id)) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Connection not found' } }, 404);
    }
    log.info('Cloud connection deleted', { id });
    return c.json({ id, status: 'deleted' });
  });

  // --- POST /v1/cloud-connections/:id/sync ---
  // Manual trigger for instance discovery/sync
  app.post('/v1/cloud-connections/:id/sync', async (c) => {
    const conn = connectionStore.get(c.req.param('id'));
    if (!conn) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Connection not found' } }, 404);
    }

    try {
      const creds = JSON.parse(decrypt(conn.credentialsEncrypted, encryptionKey));
      const ec2 = createAwsEc2Provider({
        region: conn.region,
        defaultImageId: '',
        credentials: creds,
      });

      const result = await ec2.listHosts();
      if (result.isErr()) {
        connectionStore.update(conn.id, {
          status: 'error',
          error: result.error.message,
          lastSyncAt: new Date().toISOString(),
        });
        return c.json({ error: { code: 'SYNC_FAILED', message: result.error.message } }, 502);
      }

      connectionStore.update(conn.id, {
        status: 'connected',
        error: null,
        lastSyncAt: new Date().toISOString(),
      });

      // Return discovered instances for the caller to reconcile
      const instances = result.value.map((h) => ({
        id: h.id,
        name: h.name,
        status: h.status,
        ip: h.ipv4,
        region: h.datacenter,
        serverType: h.serverType,
      }));

      log.info('Manual sync completed', { connectionId: conn.id, instanceCount: instances.length });

      return c.json({ instances, syncedAt: new Date().toISOString() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      connectionStore.update(conn.id, {
        status: 'error',
        error: message,
        lastSyncAt: new Date().toISOString(),
      });
      return c.json({ error: { code: 'SYNC_FAILED', message } }, 500);
    }
  });

  return app;
}
