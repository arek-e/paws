import { randomUUID } from 'node:crypto';

import { decrypt } from '@paws/credentials';
import { createLogger } from '@paws/logger';
import { createAwsEc2Provider } from '@paws/provider-aws-ec2';
import type { Server } from '@paws/provisioner';

import type { Ec2Lifecycle } from './ec2-lifecycle.js';
import type { CloudConnectionStore } from './store/cloud-connections.js';
import type { ServerStore } from './store/servers.js';

const log = createLogger('ec2-sync');

const DEFAULT_POLL_INTERVAL_MS = 30_000;

export interface Ec2SyncDeps {
  serverStore: ServerStore;
  connectionStore: CloudConnectionStore;
  ec2Lifecycle: Ec2Lifecycle;
  encryptionKey: Buffer;
  pollIntervalMs?: number;
}

export function createEc2Sync(deps: Ec2SyncDeps) {
  const { serverStore, connectionStore, ec2Lifecycle, encryptionKey } = deps;
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  let timer: ReturnType<typeof setInterval> | null = null;

  /** Sync individual servers that have per-server credentials (legacy path) */
  async function syncServerCredentials(): Promise<void> {
    const servers = serverStore
      .list()
      .filter((s) => s.provider === 'aws-ec2' && s.status !== 'error' && s.providerServerId);

    if (servers.length === 0) return;

    // Group by region to reuse providers
    const byRegion = new Map<string, Server[]>();
    for (const server of servers) {
      const region = server.awsRegion ?? 'unknown';
      if (!byRegion.has(region)) byRegion.set(region, []);
      byRegion.get(region)!.push(server);
    }

    for (const [region, regionServers] of byRegion) {
      const ec2 = ec2Lifecycle.getProviderForServer(regionServers[0]!);
      if (!ec2) {
        log.warn('Cannot sync region: no valid credentials', { region });
        continue;
      }

      for (const server of regionServers) {
        const result = await ec2.getHost(server.providerServerId!);

        if (result.isErr()) {
          if (result.error.code === 'NOT_FOUND') {
            log.warn('Instance terminated externally', {
              serverId: server.id,
              instanceId: server.providerServerId,
            });
            serverStore.update(server.id, {
              status: 'error',
              error: 'EC2 instance terminated externally',
            });
          }
          continue;
        }

        const host = result.value;
        if (host.status === 'error') {
          log.warn('Instance stopped externally', {
            serverId: server.id,
            instanceId: server.providerServerId,
          });
          serverStore.update(server.id, {
            status: 'error',
            error: 'EC2 instance stopped externally',
          });
        } else if (host.status === 'deleting') {
          log.warn('Instance shutting down', {
            serverId: server.id,
            instanceId: server.providerServerId,
          });
          serverStore.update(server.id, {
            status: 'error',
            error: 'EC2 instance shutting down',
          });
        }
      }
    }
  }

  /** Discover and reconcile instances from cloud connections */
  async function syncConnections(): Promise<void> {
    const connections = connectionStore.listByProvider('aws-ec2');
    if (connections.length === 0) return;

    // Build a set of known instance IDs from the server store
    const knownInstanceIds = new Set(
      serverStore
        .list()
        .filter((s) => s.provider === 'aws-ec2' && s.providerServerId)
        .map((s) => s.providerServerId!),
    );

    for (const conn of connections) {
      try {
        const creds = JSON.parse(decrypt(conn.credentialsEncrypted, encryptionKey));
        const ec2 = createAwsEc2Provider({
          region: conn.region,
          defaultImageId: '',
          credentials: creds,
        });

        const result = await ec2.listHosts();
        if (result.isErr()) {
          log.warn('Connection sync failed', {
            connectionId: conn.id,
            error: result.error.message,
          });
          connectionStore.update(conn.id, {
            status: 'error',
            error: result.error.message,
            lastSyncAt: new Date().toISOString(),
          });
          continue;
        }

        const hosts = result.value;

        // Auto-import instances that aren't in the server store
        for (const host of hosts) {
          if (knownInstanceIds.has(host.id)) continue;

          // Only import running instances
          if (host.status !== 'ready') continue;

          const serverId = randomUUID();
          log.info('Discovered EC2 instance, importing', {
            connectionId: conn.id,
            instanceId: host.id,
            name: host.name,
            ip: host.ipv4,
          });

          serverStore.create({
            id: serverId,
            name: host.name || `ec2-${host.id.slice(-8)}`,
            ip: host.ipv4 ?? '',
            status: 'ready',
            provider: 'aws-ec2',
            providerServerId: host.id,
            sshPublicKey: '',
            sshPrivateKeyEncrypted: '',
            createdAt: host.createdAt || new Date().toISOString(),
            awsRegion: conn.region,
            // Use connection credentials for this server
            awsCredentialsEncrypted: conn.credentialsEncrypted,
          });

          knownInstanceIds.add(host.id);
        }

        // Check for terminated instances that we know about
        const hostIds = new Set(hosts.map((h) => h.id));
        const serversForRegion = serverStore
          .list()
          .filter(
            (s) =>
              s.provider === 'aws-ec2' &&
              s.awsRegion === conn.region &&
              s.providerServerId &&
              s.status !== 'error',
          );

        for (const server of serversForRegion) {
          if (!hostIds.has(server.providerServerId!)) {
            // Instance not in list — terminated or filtered out
            log.warn('Instance no longer found via connection', {
              connectionId: conn.id,
              serverId: server.id,
              instanceId: server.providerServerId,
            });
            serverStore.update(server.id, {
              status: 'error',
              error: 'EC2 instance terminated (not found in AWS)',
            });
          }
        }

        connectionStore.update(conn.id, {
          status: 'connected',
          error: null,
          lastSyncAt: new Date().toISOString(),
        });
      } catch (err) {
        log.error('Connection sync error', {
          connectionId: conn.id,
          error: err instanceof Error ? err.message : String(err),
        });
        connectionStore.update(conn.id, {
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
          lastSyncAt: new Date().toISOString(),
        });
      }
    }
  }

  async function syncOnce(): Promise<void> {
    await syncServerCredentials();
    await syncConnections();
  }

  /** Recover servers stuck in provisioning/bootstrapping after a crash */
  async function recoverOnStartup(): Promise<void> {
    const stuckServers = serverStore
      .list()
      .filter(
        (s) =>
          s.provider === 'aws-ec2' &&
          (s.status === 'provisioning' ||
            s.status === 'bootstrapping' ||
            s.status === 'waiting_ssh'),
      );

    if (stuckServers.length === 0) return;

    log.info('Recovering stuck EC2 servers', { count: stuckServers.length });

    for (const server of stuckServers) {
      if (!server.providerServerId || !server.awsCredentialsEncrypted) {
        log.warn('Stuck server has no instance ID or credentials, marking as error', {
          serverId: server.id,
        });
        serverStore.update(server.id, {
          status: 'error',
          error:
            'Server was stuck in provisioning after control plane restart (no instance ID or credentials stored)',
        });
        continue;
      }

      const ec2 = ec2Lifecycle.getProviderForServer(server);
      if (!ec2) {
        serverStore.update(server.id, {
          status: 'error',
          error: 'Cannot reconnect to AWS (credential decryption failed)',
        });
        continue;
      }

      const result = await ec2.getHost(server.providerServerId);
      if (result.isErr()) {
        log.warn('Stuck server instance not found in AWS', {
          serverId: server.id,
          instanceId: server.providerServerId,
        });
        serverStore.update(server.id, {
          status: 'error',
          error: 'EC2 instance not found after control plane restart',
        });
      } else if (result.value.status === 'ready') {
        log.info('Stuck server instance is running, marking as error for manual retry', {
          serverId: server.id,
          instanceId: server.providerServerId,
        });
        serverStore.update(server.id, {
          status: 'error',
          error:
            'Bootstrap interrupted by control plane restart. Instance is running — delete and re-provision.',
        });
      } else {
        serverStore.update(server.id, {
          status: 'error',
          error: `EC2 instance in unexpected state (${result.value.status}) after control plane restart`,
        });
      }
    }
  }

  return {
    async start(): Promise<void> {
      await recoverOnStartup();
      // Run first sync immediately
      await syncOnce().catch((err) => {
        log.error('Initial EC2 sync failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
      timer = setInterval(() => {
        syncOnce().catch((err) => {
          log.error('EC2 sync failed', { error: err instanceof Error ? err.message : String(err) });
        });
      }, pollIntervalMs);
      log.info('Started', { pollIntervalMs });
    },

    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
        log.info('Stopped');
      }
    },
  };
}
