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
import { ProviderError } from './provider-interface.js';
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

/**
 * Create an AWS EC2 HostProvider.
 *
 * @param config - Provider configuration including region and default AMI.
 * @returns A HostProvider implementation backed by the AWS EC2 API.
 */
export function createAwsEc2Provider(config: AwsEc2Config): HostProvider {
  const client = createAwsEc2Client({
    region: config.region,
    ...(config.credentials ? { credentials: config.credentials } : {}),
    ...(config.ec2Client ? { ec2Client: config.ec2Client } : {}),
  });

  return {
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
          ...(options.location ? { subnetId: options.location } : {}),
          ...(options.userData ? { userData: options.userData } : {}),
        })
        .map(mapInstance);
    },

    deleteHost(id: string): ResultAsync<void, ProviderError> {
      return client.terminateInstance(id).andThen(() => okAsync(undefined));
    },
  };
}
