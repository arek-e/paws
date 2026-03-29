import { createLogger } from '@paws/logger';
import type { Server } from '@paws/provisioner';

import type { Ec2Lifecycle } from './ec2-lifecycle.js';
import type { ServerStore } from './store/servers.js';

const log = createLogger('ec2-sync');

const DEFAULT_POLL_INTERVAL_MS = 30_000;

export interface Ec2SyncDeps {
  serverStore: ServerStore;
  ec2Lifecycle: Ec2Lifecycle;
  pollIntervalMs?: number;
}

export function createEc2Sync(deps: Ec2SyncDeps) {
  const { serverStore, ec2Lifecycle } = deps;
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function syncOnce(): Promise<void> {
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
      // Use the first server's credentials to create a provider for this region
      const ec2 = ec2Lifecycle.getProviderForServer(regionServers[0]!);
      if (!ec2) {
        log.warn('Cannot sync region: no valid credentials', { region });
        continue;
      }

      for (const server of regionServers) {
        const result = await ec2.getHost(server.providerServerId!);

        if (result.isErr()) {
          // NOT_FOUND means instance was terminated externally
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
          // Other errors (API_ERROR, etc.) — skip, will retry next cycle
          continue;
        }

        const host = result.value;
        if (host.status === 'error') {
          // EC2 'stopped' maps to host status 'error'
          log.warn('Instance stopped externally', {
            serverId: server.id,
            instanceId: server.providerServerId,
          });
          serverStore.update(server.id, {
            status: 'error',
            error: 'EC2 instance stopped externally',
          });
        } else if (host.status === 'deleting') {
          // shutting-down / stopping / terminated
          log.warn('Instance shutting down', {
            serverId: server.id,
            instanceId: server.providerServerId,
          });
          serverStore.update(server.id, {
            status: 'error',
            error: 'EC2 instance shutting down',
          });
        }
        // 'ready' or 'provisioning' — no change needed
      }
    }
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
        // No instance ID or no credentials — mark as error
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
        // Instance is running — mark as error so user can retry bootstrap
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
