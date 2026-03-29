import { eq } from 'drizzle-orm';
import type { Server } from '@paws/provisioner';

import type { PawsDatabase } from '../db/index.js';
import { servers as serversTable } from '../db/schema.js';

export interface ServerStore {
  create(server: Server): void;
  get(id: string): Server | undefined;
  update(id: string, patch: Partial<Server>): Server | undefined;
  delete(id: string): boolean;
  list(): Server[];
}

/** In-memory server store (for tests) */
export function createServerStore(): ServerStore {
  const servers = new Map<string, Server>();

  return {
    create(server) {
      servers.set(server.id, server);
    },
    get(id) {
      return servers.get(id);
    },
    update(id, patch) {
      const existing = servers.get(id);
      if (!existing) return undefined;
      const updated = { ...existing, ...patch };
      servers.set(id, updated);
      return updated;
    },
    delete(id) {
      return servers.delete(id);
    },
    list() {
      return Array.from(servers.values());
    },
  };
}

type ServerRow = typeof serversTable.$inferSelect;

function rowToServer(row: ServerRow): Server {
  return {
    id: row.id,
    name: row.name,
    ip: row.ip,
    status: row.status as Server['status'],
    provider: row.provider as Server['provider'],
    error: row.error ?? undefined,
    sshPublicKey: row.sshPublicKey,
    sshPrivateKeyEncrypted: row.sshPrivateKeyEncrypted,
    providerServerId: row.providerServerId ?? undefined,
    createdAt: row.createdAt,
    awsRegion: row.awsRegion ?? undefined,
    awsSecurityGroupId: row.awsSecurityGroupId ?? undefined,
    awsKeyPairName: row.awsKeyPairName ?? undefined,
    awsCredentialsEncrypted: row.awsCredentialsEncrypted ?? undefined,
  };
}

/** SQLite-backed server store */
export function createSqliteServerStore(db: PawsDatabase): ServerStore {
  return {
    create(server) {
      db.insert(serversTable)
        .values({
          id: server.id,
          name: server.name,
          ip: server.ip,
          status: server.status,
          provider: server.provider,
          error: server.error ?? null,
          sshPublicKey: server.sshPublicKey,
          sshPrivateKeyEncrypted: server.sshPrivateKeyEncrypted,
          providerServerId: server.providerServerId ?? null,
          createdAt: server.createdAt,
          awsRegion: server.awsRegion ?? null,
          awsSecurityGroupId: server.awsSecurityGroupId ?? null,
          awsKeyPairName: server.awsKeyPairName ?? null,
          awsCredentialsEncrypted: server.awsCredentialsEncrypted ?? null,
        })
        .run();
    },

    get(id) {
      const row = db.select().from(serversTable).where(eq(serversTable.id, id)).get();
      return row ? rowToServer(row) : undefined;
    },

    update(id, patch) {
      const existing = this.get(id);
      if (!existing) return undefined;

      const values: Record<string, unknown> = {};
      if (patch.name !== undefined) values['name'] = patch.name;
      if (patch.ip !== undefined) values['ip'] = patch.ip;
      if (patch.status !== undefined) values['status'] = patch.status;
      if (patch.provider !== undefined) values['provider'] = patch.provider;
      if (patch.error !== undefined) values['error'] = patch.error;
      if (patch.sshPublicKey !== undefined) values['sshPublicKey'] = patch.sshPublicKey;
      if (patch.sshPrivateKeyEncrypted !== undefined)
        values['sshPrivateKeyEncrypted'] = patch.sshPrivateKeyEncrypted;
      if (patch.providerServerId !== undefined) values['providerServerId'] = patch.providerServerId;
      if (patch.awsRegion !== undefined) values['awsRegion'] = patch.awsRegion;
      if (patch.awsSecurityGroupId !== undefined)
        values['awsSecurityGroupId'] = patch.awsSecurityGroupId;
      if (patch.awsKeyPairName !== undefined) values['awsKeyPairName'] = patch.awsKeyPairName;
      if (patch.awsCredentialsEncrypted !== undefined)
        values['awsCredentialsEncrypted'] = patch.awsCredentialsEncrypted;

      if (Object.keys(values).length > 0) {
        db.update(serversTable).set(values).where(eq(serversTable.id, id)).run();
      }
      return this.get(id);
    },

    delete(id) {
      const existing = this.get(id);
      if (!existing) return false;
      db.delete(serversTable).where(eq(serversTable.id, id)).run();
      return true;
    },

    list() {
      return db.select().from(serversTable).all().map(rowToServer);
    },
  };
}
