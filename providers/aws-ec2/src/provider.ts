/**
 * AWS EC2 HostProvider implementation.
 *
 * Creates EC2 instances with /dev/kvm support (Intel Nitro instances like
 * c5.metal, c5.large, c6i.large). These are intended as paws worker nodes
 * that run Firecracker VMs.
 */

import { ResultAsync, okAsync } from 'neverthrow';

import { createAwsEc2Client } from './client.js';
import type { AwsEc2ClientOptions, Ec2ClientDep } from './client.js';
import type { CreateHostOptions, Host, HostProvider, HostStatus } from './provider-interface.js';
import { ProviderError, ProviderErrorCode } from './provider-interface.js';
import type { Ec2Instance, Ec2InstanceState } from './types.js';

export interface AwsEc2Config {
  /** AWS region (e.g. "us-east-1") */
  region: string;
  /** Default AMI ID for new instances */
  defaultImageId: string;
  /** AWS credentials — if omitted, SDK uses default credential chain */
  credentials?: AwsEc2ClientOptions['credentials'];
  /** Injected EC2 client for testability */
  ec2Client?: Ec2ClientDep;
}

/**
 * Map an EC2 instance state to the canonical HostStatus.
 *
 * - pending                       -> provisioning
 * - running                       -> ready
 * - shutting-down, stopping       -> deleting
 * - terminated                    -> deleting (terminal but consistent with interface)
 * - stopped                       -> error
 */
function mapStatus(state: Ec2InstanceState): HostStatus {
  switch (state) {
    case 'pending':
      return 'provisioning';
    case 'running':
      return 'ready';
    case 'shutting-down':
    case 'stopping':
    case 'terminated':
      return 'deleting';
    case 'stopped':
      return 'error';
  }
}

function mapInstance(instance: Ec2Instance): Host {
  return {
    id: instance.instanceId,
    name: instance.name,
    status: mapStatus(instance.state),
    ipv4: instance.publicIpV4,
    ipv6: instance.publicIpV6,
    datacenter: instance.availabilityZone,
    serverType: instance.instanceType,
    createdAt: instance.launchTime,
    metadata: {
      firecrackerSupported: 'true',
    },
  };
}

/** Extended provider with AWS-specific methods beyond the HostProvider interface */
export interface AwsEc2Provider extends HostProvider {
  /** Poll getHost until instance is ready with an IP, or timeout. */
  waitForReady(
    instanceId: string,
    timeoutMs?: number,
    pollIntervalMs?: number,
  ): ResultAsync<{ ip: string }, ProviderError>;

  /** Create a security group with SSH (22) and worker API (3000) ingress + all egress. */
  createSecurityGroup(name: string, description: string): ResultAsync<string, ProviderError>;

  /** Create an EC2 key pair. Returns the key pair ID and private key material (PEM). */
  createKeyPair(
    name: string,
  ): ResultAsync<{ keyPairId: string; privateKey: string }, ProviderError>;

  /** Resolve the latest Ubuntu 24.04 amd64 AMI ID for the current region. */
  resolveUbuntuAmi(): ResultAsync<string, ProviderError>;

  /** Delete a security group by ID. Idempotent. */
  deleteSecurityGroup(groupId: string): ResultAsync<void, ProviderError>;

  /** Delete a key pair by name. Idempotent. */
  deleteKeyPair(name: string): ResultAsync<void, ProviderError>;
}

const DEFAULT_WAIT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 5_000; // 5 seconds

/**
 * Create an AWS EC2 HostProvider with AWS-specific extensions.
 *
 * @param config - Provider configuration including region and default AMI.
 * @returns An AwsEc2Provider implementation backed by the AWS EC2 API.
 */
export function createAwsEc2Provider(config: AwsEc2Config): AwsEc2Provider {
  const client = createAwsEc2Client({
    region: config.region,
    ...(config.credentials ? { credentials: config.credentials } : {}),
    ...(config.ec2Client ? { ec2Client: config.ec2Client } : {}),
  });

  const provider: AwsEc2Provider = {
    listHosts() {
      return client.listInstances().map((instances) => instances.map(mapInstance));
    },

    getHost(id: string) {
      return client.getInstance(id).map(mapInstance);
    },

    createHost(options: CreateHostOptions) {
      return client
        .createInstance({
          name: options.name,
          instanceType: options.serverType,
          imageId: config.defaultImageId,
          ...(options.sshKeys?.length ? { keyName: options.sshKeys[0] } : {}),
          ...(options.securityGroupIds?.length
            ? { securityGroupIds: options.securityGroupIds }
            : {}),
          ...(options.location ? { subnetId: options.location } : {}),
          ...(options.userData ? { userData: options.userData } : {}),
        })
        .map(mapInstance);
    },

    deleteHost(id: string): ResultAsync<void, ProviderError> {
      return client.terminateInstance(id).andThen(() => okAsync(undefined));
    },

    waitForReady(
      instanceId: string,
      timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS,
      pollIntervalMs: number = POLL_INTERVAL_MS,
    ): ResultAsync<{ ip: string }, ProviderError> {
      return ResultAsync.fromPromise(
        (async () => {
          const deadline = Date.now() + timeoutMs;

          while (Date.now() < deadline) {
            const result = await provider.getHost(instanceId);

            if (result.isErr()) {
              throw result.error;
            }

            const host = result.value;

            if (host.status === 'deleting' || host.status === 'error') {
              throw new ProviderError(
                ProviderErrorCode.API_ERROR,
                `Instance ${instanceId} entered terminal state: ${host.status}`,
              );
            }

            if (host.status === 'ready' && host.ipv4) {
              return { ip: host.ipv4 };
            }

            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          }

          throw new ProviderError(
            ProviderErrorCode.TIMEOUT,
            `Instance ${instanceId} did not become ready within ${timeoutMs}ms`,
          );
        })(),
        (e) => {
          if (e instanceof ProviderError) return e;
          return new ProviderError(
            ProviderErrorCode.API_ERROR,
            `waitForReady(${instanceId}) failed: ${e}`,
            e,
          );
        },
      );
    },

    createSecurityGroup(name: string, description: string): ResultAsync<string, ProviderError> {
      return client.createSecurityGroup(name, description);
    },

    createKeyPair(
      name: string,
    ): ResultAsync<{ keyPairId: string; privateKey: string }, ProviderError> {
      return client.createKeyPair(name);
    },

    resolveUbuntuAmi(): ResultAsync<string, ProviderError> {
      return client.resolveUbuntuAmi();
    },

    deleteSecurityGroup(groupId: string): ResultAsync<void, ProviderError> {
      return client.deleteSecurityGroup(groupId);
    },

    deleteKeyPair(name: string): ResultAsync<void, ProviderError> {
      return client.deleteKeyPair(name);
    },
  };

  return provider;
}
