import { decrypt } from '@paws/credentials';
import { createLogger } from '@paws/logger';
import { createAwsEc2Provider } from '@paws/provider-aws-ec2';
import type { AwsEc2Provider } from '@paws/provider-aws-ec2';
import type { Server } from '@paws/provisioner';

const log = createLogger('ec2-lifecycle');

export interface Ec2LifecycleDeps {
  encryptionKey: Buffer;
}

export interface Ec2Lifecycle {
  /** Reconstruct an AwsEc2Provider from a server's stored encrypted credentials. Returns null for non-EC2 servers. */
  getProviderForServer(server: Server): AwsEc2Provider | null;
  /** Terminate an EC2 server and clean up all AWS resources (instance, SG, key pair). Best-effort. */
  destroyServer(server: Server): Promise<void>;
}

export function createEc2Lifecycle(deps: Ec2LifecycleDeps): Ec2Lifecycle {
  return {
    getProviderForServer(server: Server): AwsEc2Provider | null {
      if (server.provider !== 'aws-ec2') return null;
      if (!server.awsCredentialsEncrypted || !server.awsRegion) return null;

      try {
        const credsJson = decrypt(server.awsCredentialsEncrypted, deps.encryptionKey);
        const { accessKeyId, secretAccessKey } = JSON.parse(credsJson);
        return createAwsEc2Provider({
          region: server.awsRegion,
          defaultImageId: '', // not needed for lifecycle operations
          credentials: { accessKeyId, secretAccessKey },
        });
      } catch (err) {
        log.error('Failed to decrypt AWS credentials', {
          serverId: server.id,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    },

    async destroyServer(server: Server): Promise<void> {
      const slog = log.child({ serverId: server.id });

      const ec2 = this.getProviderForServer(server);
      if (!ec2) {
        slog.warn('Cannot destroy server: no AWS credentials stored');
        return;
      }

      // 1. Terminate instance
      if (server.providerServerId) {
        slog.info('Terminating EC2 instance', { instanceId: server.providerServerId });
        await ec2.deleteHost(server.providerServerId).match(
          () => slog.info('Terminated instance', { instanceId: server.providerServerId }),
          (e) =>
            slog.warn('Failed to terminate instance', {
              instanceId: server.providerServerId,
              error: e.message,
            }),
        );
        // Wait for instance to start terminating before deleting SG
        // (AWS rejects SG deletion while an instance references it)
        await new Promise((r) => setTimeout(r, 5_000));
      }

      // 2. Delete security group
      if (server.awsSecurityGroupId) {
        slog.info('Deleting security group', { sgId: server.awsSecurityGroupId });
        await ec2.deleteSecurityGroup(server.awsSecurityGroupId).match(
          () => slog.info('Deleted security group', { sgId: server.awsSecurityGroupId }),
          (e) =>
            slog.warn('Failed to delete security group', {
              sgId: server.awsSecurityGroupId,
              error: e.message,
            }),
        );
      }

      // 3. Delete key pair
      if (server.awsKeyPairName) {
        slog.info('Deleting key pair', { keyPair: server.awsKeyPairName });
        await ec2.deleteKeyPair(server.awsKeyPairName).match(
          () => slog.info('Deleted key pair', { keyPair: server.awsKeyPairName }),
          (e) =>
            slog.warn('Failed to delete key pair', {
              keyPair: server.awsKeyPairName,
              error: e.message,
            }),
        );
      }

      slog.info('AWS resource cleanup complete');
    },
  };
}
