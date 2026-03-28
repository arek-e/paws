import {
  DescribeInstancesCommand,
  EC2Client,
  RunInstancesCommand,
  TerminateInstancesCommand,
} from '@aws-sdk/client-ec2';
import type { EC2ClientConfig, Instance, RunInstancesCommandInput } from '@aws-sdk/client-ec2';
import { ResultAsync } from 'neverthrow';

import { ProviderError, ProviderErrorCode } from './provider-interface.js';
import type { CreateInstanceRequest, Ec2Instance, Ec2InstanceState } from './types.js';

/** Allows injecting a mock EC2Client for testability */
export type Ec2ClientDep = Pick<EC2Client, 'send'>;

export interface AwsEc2ClientOptions {
  /** AWS region (e.g. "us-east-1") */
  region: string;
  /** Optional AWS credentials — if omitted, SDK uses default credential chain */
  credentials?: EC2ClientConfig['credentials'];
  /** Injected EC2Client for unit testing */
  ec2Client?: Ec2ClientDep;
}

const MANAGED_TAG_KEY = 'paws:managed';
const MANAGED_TAG_VALUE = 'true';

/** Map an AWS SDK Instance to our Ec2Instance type */
function mapInstance(instance: Instance): Ec2Instance {
  const tags: Record<string, string> = {};
  for (const tag of instance.Tags ?? []) {
    if (tag.Key && tag.Value) {
      tags[tag.Key] = tag.Value;
    }
  }

  const stateStr = (instance.State?.Name ?? 'pending') as Ec2InstanceState;

  return {
    instanceId: instance.InstanceId ?? '',
    name: tags['Name'] ?? '',
    state: stateStr,
    instanceType: instance.InstanceType ?? '',
    publicIpV4: instance.PublicIpAddress ?? null,
    publicIpV6: instance.Ipv6Address ?? null,
    availabilityZone: instance.Placement?.AvailabilityZone ?? '',
    launchTime: instance.LaunchTime?.toISOString() ?? '',
    tags,
  };
}

function wrapError(code: ProviderErrorCode, label: string, e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  return new ProviderError(code, `${label}: ${e}`, e);
}

/**
 * Thin client wrapping @aws-sdk/client-ec2 for the operations paws needs.
 * Accepts an injected EC2Client for unit testability.
 */
export function createAwsEc2Client(options: AwsEc2ClientOptions) {
  const ec2: Ec2ClientDep =
    options.ec2Client ??
    new EC2Client({
      region: options.region,
      ...(options.credentials ? { credentials: options.credentials } : {}),
    });

  return {
    /** List all paws-managed instances (filtered by paws:managed=true tag) */
    listInstances(): ResultAsync<Ec2Instance[], ProviderError> {
      return ResultAsync.fromPromise(
        (async () => {
          const command = new DescribeInstancesCommand({
            Filters: [
              { Name: `tag:${MANAGED_TAG_KEY}`, Values: [MANAGED_TAG_VALUE] },
              // Exclude terminated instances from list results
              {
                Name: 'instance-state-name',
                Values: ['pending', 'running', 'stopping', 'shutting-down', 'stopped'],
              },
            ],
          });
          const response = await ec2.send(command);
          const instances: Ec2Instance[] = [];
          for (const reservation of response.Reservations ?? []) {
            for (const instance of reservation.Instances ?? []) {
              instances.push(mapInstance(instance));
            }
          }
          return instances;
        })(),
        (e) => wrapError(ProviderErrorCode.LIST_FAILED, 'listInstances failed', e),
      );
    },

    /** Get a single instance by ID */
    getInstance(id: string): ResultAsync<Ec2Instance, ProviderError> {
      return ResultAsync.fromPromise(
        (async () => {
          const command = new DescribeInstancesCommand({
            InstanceIds: [id],
          });
          const response = await ec2.send(command);
          const instance = response.Reservations?.[0]?.Instances?.[0];
          if (!instance) {
            throw new ProviderError(ProviderErrorCode.NOT_FOUND, `EC2 instance ${id} not found`);
          }
          return mapInstance(instance);
        })(),
        (e) => wrapError(ProviderErrorCode.API_ERROR, `getInstance(${id}) failed`, e),
      );
    },

    /** Create a new EC2 instance with paws:managed tag */
    createInstance(request: CreateInstanceRequest): ResultAsync<Ec2Instance, ProviderError> {
      return ResultAsync.fromPromise(
        (async () => {
          const input: RunInstancesCommandInput = {
            ImageId: request.imageId,
            InstanceType: request.instanceType,
            MinCount: 1,
            MaxCount: 1,
            TagSpecifications: [
              {
                ResourceType: 'instance',
                Tags: [
                  { Key: 'Name', Value: request.name },
                  { Key: MANAGED_TAG_KEY, Value: MANAGED_TAG_VALUE },
                ],
              },
            ],
            ...(request.keyName ? { KeyName: request.keyName } : {}),
            ...(request.securityGroupIds?.length
              ? { SecurityGroupIds: request.securityGroupIds }
              : {}),
            ...(request.subnetId ? { SubnetId: request.subnetId } : {}),
            ...(request.userData ? { UserData: request.userData } : {}),
          };
          const command = new RunInstancesCommand(input);
          const response = await ec2.send(command);
          const instance = response.Instances?.[0];
          if (!instance) {
            throw new ProviderError(
              ProviderErrorCode.CREATE_FAILED,
              'RunInstances returned no instances',
            );
          }
          return mapInstance(instance);
        })(),
        (e) => wrapError(ProviderErrorCode.CREATE_FAILED, 'createInstance failed', e),
      );
    },

    /** Terminate an instance. Returns true if terminated, false if already gone. */
    terminateInstance(id: string): ResultAsync<boolean, ProviderError> {
      return ResultAsync.fromPromise(
        (async () => {
          const command = new TerminateInstancesCommand({
            InstanceIds: [id],
          });
          try {
            await ec2.send(command);
            return true;
          } catch (error: unknown) {
            // AWS throws InvalidInstanceID.NotFound for unknown instances
            if (error instanceof Error && error.name === 'InvalidInstanceID.NotFound') {
              return false;
            }
            throw error;
          }
        })(),
        (e) => wrapError(ProviderErrorCode.DELETE_FAILED, `terminateInstance(${id}) failed`, e),
      );
    },
  };
}

export type AwsEc2Client = ReturnType<typeof createAwsEc2Client>;
