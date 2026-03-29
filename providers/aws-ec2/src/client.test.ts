import { describe, expect, it, vi } from 'vitest';

import { createAwsEc2Client } from './client.js';
import type { Ec2ClientDep } from './client.js';
import { ProviderErrorCode } from './provider-interface.js';

/**
 * Build a mock EC2Client that returns canned responses.
 * The send() method inspects the command constructor name to route responses.
 */
function mockEc2Client(handlers: {
  DescribeInstances?: () => unknown;
  DescribeImages?: () => unknown;
  RunInstances?: () => unknown;
  TerminateInstances?: () => unknown;
  CreateSecurityGroup?: () => unknown;
  AuthorizeSecurityGroupIngress?: () => unknown;
  CreateKeyPair?: () => unknown;
  DeleteSecurityGroup?: () => unknown;
  DeleteKeyPair?: () => unknown;
}): Ec2ClientDep & { sendSpy: ReturnType<typeof vi.fn> } {
  const sendSpy = vi.fn(async (command: { constructor: { name: string } }) => {
    const name = command.constructor.name.replace('Command', '');
    const handler = handlers[name as keyof typeof handlers];
    if (handler) return handler();
    throw new Error(`Unexpected command: ${name}`);
  });
  return { send: sendSpy as Ec2ClientDep['send'], sendSpy };
}

/** Helper: build a minimal AWS SDK Instance fixture */
function makeAwsInstance(overrides: Record<string, unknown> = {}) {
  return {
    InstanceId: 'i-abc123',
    InstanceType: 'c5.large',
    State: { Name: 'running' },
    PublicIpAddress: '54.1.2.3',
    Ipv6Address: null,
    Placement: { AvailabilityZone: 'us-east-1a' },
    LaunchTime: new Date('2024-06-01T10:00:00Z'),
    Tags: [
      { Key: 'Name', Value: 'paws-worker-1' },
      { Key: 'paws:managed', Value: 'true' },
    ],
    ...overrides,
  };
}

describe('createAwsEc2Client', () => {
  describe('listInstances', () => {
    it('returns mapped instance list on success', async () => {
      const ec2 = mockEc2Client({
        DescribeInstances: () => ({
          Reservations: [{ Instances: [makeAwsInstance()] }],
        }),
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      const result = await client.listInstances();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.instanceId).toBe('i-abc123');
        expect(result.value[0]?.name).toBe('paws-worker-1');
        expect(result.value[0]?.state).toBe('running');
        expect(result.value[0]?.instanceType).toBe('c5.large');
        expect(result.value[0]?.publicIpV4).toBe('54.1.2.3');
      }
    });

    it('returns empty list when no reservations', async () => {
      const ec2 = mockEc2Client({
        DescribeInstances: () => ({ Reservations: [] }),
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      const result = await client.listInstances();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(0);
      }
    });

    it('returns LIST_FAILED error when SDK throws', async () => {
      const ec2 = mockEc2Client({
        DescribeInstances: () => {
          throw new Error('Access denied');
        },
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      const result = await client.listInstances();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.LIST_FAILED);
      }
    });

    it('sends DescribeInstances with paws:managed filter', async () => {
      const ec2 = mockEc2Client({
        DescribeInstances: () => ({ Reservations: [] }),
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      await client.listInstances();

      expect(ec2.sendSpy).toHaveBeenCalledOnce();
      const command = ec2.sendSpy.mock.calls[0]?.[0];
      expect(command.constructor.name).toBe('DescribeInstancesCommand');
      expect(command.input.Filters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ Name: 'tag:paws:managed', Values: ['true'] }),
        ]),
      );
    });
  });

  describe('getInstance', () => {
    it('returns instance on success', async () => {
      const ec2 = mockEc2Client({
        DescribeInstances: () => ({
          Reservations: [
            {
              Instances: [
                makeAwsInstance({ InstanceId: 'i-42', Tags: [{ Key: 'Name', Value: 'my-node' }] }),
              ],
            },
          ],
        }),
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      const result = await client.getInstance('i-42');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.instanceId).toBe('i-42');
        expect(result.value.name).toBe('my-node');
      }
    });

    it('returns NOT_FOUND when no instances in response', async () => {
      const ec2 = mockEc2Client({
        DescribeInstances: () => ({ Reservations: [] }),
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      const result = await client.getInstance('i-nonexistent');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.NOT_FOUND);
      }
    });

    it('returns API_ERROR when SDK throws', async () => {
      const ec2 = mockEc2Client({
        DescribeInstances: () => {
          throw new Error('Internal error');
        },
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      const result = await client.getInstance('i-1');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.API_ERROR);
      }
    });

    it('sends DescribeInstances with correct InstanceIds', async () => {
      const ec2 = mockEc2Client({
        DescribeInstances: () => ({
          Reservations: [{ Instances: [makeAwsInstance({ InstanceId: 'i-7' })] }],
        }),
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      await client.getInstance('i-7');

      const command = ec2.sendSpy.mock.calls[0]?.[0];
      expect(command.input.InstanceIds).toEqual(['i-7']);
    });
  });

  describe('createInstance', () => {
    it('returns created instance on success', async () => {
      const ec2 = mockEc2Client({
        RunInstances: () => ({
          Instances: [
            makeAwsInstance({
              InstanceId: 'i-new',
              State: { Name: 'pending' },
              Tags: [
                { Key: 'Name', Value: 'new-worker' },
                { Key: 'paws:managed', Value: 'true' },
              ],
            }),
          ],
        }),
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      const result = await client.createInstance({
        name: 'new-worker',
        instanceType: 'c5.large',
        imageId: 'ami-12345',
        keyName: 'my-key',
        securityGroupIds: ['sg-123'],
        subnetId: 'subnet-abc',
        userData: 'IyEvYmluL2Jhc2g=', // base64
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.instanceId).toBe('i-new');
        expect(result.value.name).toBe('new-worker');
        expect(result.value.state).toBe('pending');
      }
    });

    it('sends RunInstances with correct parameters', async () => {
      const ec2 = mockEc2Client({
        RunInstances: () => ({
          Instances: [makeAwsInstance({ InstanceId: 'i-new', State: { Name: 'pending' } })],
        }),
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      await client.createInstance({
        name: 'worker-1',
        instanceType: 'c6i.large',
        imageId: 'ami-abc',
        keyName: 'my-key',
      });

      const command = ec2.sendSpy.mock.calls[0]?.[0];
      expect(command.constructor.name).toBe('RunInstancesCommand');
      expect(command.input.ImageId).toBe('ami-abc');
      expect(command.input.InstanceType).toBe('c6i.large');
      expect(command.input.MinCount).toBe(1);
      expect(command.input.MaxCount).toBe(1);
      expect(command.input.KeyName).toBe('my-key');
      expect(command.input.TagSpecifications).toEqual([
        {
          ResourceType: 'instance',
          Tags: expect.arrayContaining([
            { Key: 'Name', Value: 'worker-1' },
            { Key: 'paws:managed', Value: 'true' },
          ]),
        },
      ]);
    });

    it('returns CREATE_FAILED when no instances in response', async () => {
      const ec2 = mockEc2Client({
        RunInstances: () => ({ Instances: [] }),
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      const result = await client.createInstance({
        name: 'bad',
        instanceType: 'c5.large',
        imageId: 'ami-123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.CREATE_FAILED);
      }
    });

    it('returns CREATE_FAILED when SDK throws', async () => {
      const ec2 = mockEc2Client({
        RunInstances: () => {
          throw new Error('Insufficient capacity');
        },
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      const result = await client.createInstance({
        name: 'bad',
        instanceType: 'c5.large',
        imageId: 'ami-123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.CREATE_FAILED);
      }
    });
  });

  describe('terminateInstance', () => {
    it('returns true on successful termination', async () => {
      const ec2 = mockEc2Client({
        TerminateInstances: () => ({
          TerminatingInstances: [{ InstanceId: 'i-1' }],
        }),
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      const result = await client.terminateInstance('i-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });

    it('returns false when instance not found', async () => {
      const ec2 = mockEc2Client({
        TerminateInstances: () => {
          const err = new Error('Instance not found');
          err.name = 'InvalidInstanceID.NotFound';
          throw err;
        },
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      const result = await client.terminateInstance('i-gone');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(false);
      }
    });

    it('returns DELETE_FAILED on other errors', async () => {
      const ec2 = mockEc2Client({
        TerminateInstances: () => {
          throw new Error('Internal server error');
        },
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      const result = await client.terminateInstance('i-1');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.DELETE_FAILED);
      }
    });

    it('sends TerminateInstances with correct InstanceIds', async () => {
      const ec2 = mockEc2Client({
        TerminateInstances: () => ({ TerminatingInstances: [] }),
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      await client.terminateInstance('i-5');

      const command = ec2.sendSpy.mock.calls[0]?.[0];
      expect(command.constructor.name).toBe('TerminateInstancesCommand');
      expect(command.input.InstanceIds).toEqual(['i-5']);
    });
  });

  describe('deleteSecurityGroup', () => {
    it('sends DeleteSecurityGroup with correct GroupId', async () => {
      const ec2 = mockEc2Client({
        DeleteSecurityGroup: () => ({}),
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      const result = await client.deleteSecurityGroup('sg-123');

      expect(result.isOk()).toBe(true);
      const command = ec2.sendSpy.mock.calls[0]?.[0];
      expect(command.constructor.name).toBe('DeleteSecurityGroupCommand');
      expect(command.input.GroupId).toBe('sg-123');
    });

    it('succeeds when group already deleted (InvalidGroup.NotFound)', async () => {
      const ec2 = mockEc2Client({
        DeleteSecurityGroup: () => {
          const err = new Error('not found');
          err.name = 'InvalidGroup.NotFound';
          throw err;
        },
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      const result = await client.deleteSecurityGroup('sg-gone');

      expect(result.isOk()).toBe(true);
    });

    it('returns DELETE_FAILED on other errors', async () => {
      const ec2 = mockEc2Client({
        DeleteSecurityGroup: () => {
          throw new Error('access denied');
        },
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      const result = await client.deleteSecurityGroup('sg-123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.DELETE_FAILED);
      }
    });
  });

  describe('deleteKeyPair', () => {
    it('sends DeleteKeyPair with correct KeyName', async () => {
      const ec2 = mockEc2Client({
        DeleteKeyPair: () => ({}),
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      const result = await client.deleteKeyPair('paws-abc');

      expect(result.isOk()).toBe(true);
      const command = ec2.sendSpy.mock.calls[0]?.[0];
      expect(command.constructor.name).toBe('DeleteKeyPairCommand');
      expect(command.input.KeyName).toBe('paws-abc');
    });
  });

  describe('resolveUbuntuAmi', () => {
    it('returns latest AMI by creation date', async () => {
      const ec2 = mockEc2Client({
        DescribeImages: () => ({
          Images: [
            { ImageId: 'ami-old', CreationDate: '2024-01-01' },
            { ImageId: 'ami-new', CreationDate: '2024-06-15' },
          ],
        }),
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      const result = await client.resolveUbuntuAmi();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('ami-new');
      }
    });

    it('filters by Canonical owner and Ubuntu 24.04 name pattern', async () => {
      const ec2 = mockEc2Client({
        DescribeImages: () => ({
          Images: [{ ImageId: 'ami-123', CreationDate: '2024-06-01' }],
        }),
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      await client.resolveUbuntuAmi();

      const command = ec2.sendSpy.mock.calls[0]?.[0];
      expect(command.constructor.name).toBe('DescribeImagesCommand');
      expect(command.input.Owners).toEqual(['099720109477']);
      expect(command.input.Filters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Name: 'name',
            Values: ['ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*'],
          }),
        ]),
      );
    });

    it('returns NOT_FOUND when no images match', async () => {
      const ec2 = mockEc2Client({
        DescribeImages: () => ({ Images: [] }),
      });
      const client = createAwsEc2Client({ region: 'us-east-1', ec2Client: ec2 });

      const result = await client.resolveUbuntuAmi();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.NOT_FOUND);
      }
    });
  });
});
