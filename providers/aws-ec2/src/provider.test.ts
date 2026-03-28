import { describe, expect, it, vi } from 'vitest';

import type { Ec2ClientDep } from './client.js';
import { ProviderErrorCode } from './provider-interface.js';
import { createAwsEc2Provider } from './provider.js';
import type { Ec2InstanceState } from './types.js';

const REGION = 'us-east-1';
const DEFAULT_IMAGE_ID = 'ami-ubuntu-2404';

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

/** Build a mock EC2Client that returns canned responses per command type */
function mockEc2Client(handlers: {
  DescribeInstances?: () => unknown;
  RunInstances?: () => unknown;
  TerminateInstances?: () => unknown;
}): Ec2ClientDep & { sendSpy: ReturnType<typeof vi.fn> } {
  const sendSpy = vi.fn(async (command: { constructor: { name: string } }) => {
    const name = command.constructor.name.replace('Command', '');
    const handler = handlers[name as keyof typeof handlers];
    if (handler) return handler();
    throw new Error(`Unexpected command: ${name}`);
  });
  return { send: sendSpy as Ec2ClientDep['send'], sendSpy };
}

describe('createAwsEc2Provider', () => {
  describe('listHosts', () => {
    it('returns mapped Host list', async () => {
      const ec2 = mockEc2Client({
        DescribeInstances: () => ({
          Reservations: [{ Instances: [makeAwsInstance()] }],
        }),
      });
      const provider = createAwsEc2Provider({
        region: REGION,
        defaultImageId: DEFAULT_IMAGE_ID,
        ec2Client: ec2,
      });

      const result = await provider.listHosts();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const [host] = result.value;
        expect(host?.id).toBe('i-abc123');
        expect(host?.name).toBe('paws-worker-1');
        expect(host?.status).toBe('ready');
        expect(host?.ipv4).toBe('54.1.2.3');
        expect(host?.datacenter).toBe('us-east-1a');
        expect(host?.serverType).toBe('c5.large');
        // AWS EC2 Nitro instances support /dev/kvm
        expect(host?.metadata['firecrackerSupported']).toBe('true');
      }
    });

    it('returns error when API fails', async () => {
      const ec2 = mockEc2Client({
        DescribeInstances: () => {
          throw new Error('Access denied');
        },
      });
      const provider = createAwsEc2Provider({
        region: REGION,
        defaultImageId: DEFAULT_IMAGE_ID,
        ec2Client: ec2,
      });

      const result = await provider.listHosts();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.LIST_FAILED);
      }
    });
  });

  describe('getHost', () => {
    it('returns mapped Host on success', async () => {
      const ec2 = mockEc2Client({
        DescribeInstances: () => ({
          Reservations: [
            {
              Instances: [
                makeAwsInstance({
                  InstanceId: 'i-42',
                  Tags: [{ Key: 'Name', Value: 'worker-node' }],
                }),
              ],
            },
          ],
        }),
      });
      const provider = createAwsEc2Provider({
        region: REGION,
        defaultImageId: DEFAULT_IMAGE_ID,
        ec2Client: ec2,
      });

      const result = await provider.getHost('i-42');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe('i-42');
        expect(result.value.name).toBe('worker-node');
        expect(result.value.status).toBe('ready');
      }
    });

    it('returns NOT_FOUND error when instance does not exist', async () => {
      const ec2 = mockEc2Client({
        DescribeInstances: () => ({ Reservations: [] }),
      });
      const provider = createAwsEc2Provider({
        region: REGION,
        defaultImageId: DEFAULT_IMAGE_ID,
        ec2Client: ec2,
      });

      const result = await provider.getHost('i-9999');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.NOT_FOUND);
      }
    });
  });

  describe('createHost', () => {
    it('returns provisioning host on successful creation', async () => {
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
      const provider = createAwsEc2Provider({
        region: REGION,
        defaultImageId: DEFAULT_IMAGE_ID,
        ec2Client: ec2,
      });

      const result = await provider.createHost({
        name: 'new-worker',
        serverType: 'c5.large',
        sshKeys: ['my-key-pair'],
        userData: '#!/bin/bash\necho hi',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe('i-new');
        expect(result.value.name).toBe('new-worker');
        expect(result.value.status).toBe('provisioning');
        expect(result.value.metadata['firecrackerSupported']).toBe('true');
      }
    });

    it('uses defaultImageId from config', async () => {
      const ec2 = mockEc2Client({
        RunInstances: () => ({
          Instances: [makeAwsInstance({ State: { Name: 'pending' } })],
        }),
      });
      const provider = createAwsEc2Provider({
        region: REGION,
        defaultImageId: 'ami-custom-123',
        ec2Client: ec2,
      });

      await provider.createHost({ name: 'n', serverType: 'c5.large' });

      const command = ec2.sendSpy.mock.calls[0]?.[0];
      expect(command.input.ImageId).toBe('ami-custom-123');
    });

    it('maps sshKeys[0] to keyName', async () => {
      const ec2 = mockEc2Client({
        RunInstances: () => ({
          Instances: [makeAwsInstance({ State: { Name: 'pending' } })],
        }),
      });
      const provider = createAwsEc2Provider({
        region: REGION,
        defaultImageId: DEFAULT_IMAGE_ID,
        ec2Client: ec2,
      });

      await provider.createHost({
        name: 'n',
        serverType: 'c5.large',
        sshKeys: ['my-keypair'],
      });

      const command = ec2.sendSpy.mock.calls[0]?.[0];
      expect(command.input.KeyName).toBe('my-keypair');
    });

    it('maps location to subnetId', async () => {
      const ec2 = mockEc2Client({
        RunInstances: () => ({
          Instances: [makeAwsInstance({ State: { Name: 'pending' } })],
        }),
      });
      const provider = createAwsEc2Provider({
        region: REGION,
        defaultImageId: DEFAULT_IMAGE_ID,
        ec2Client: ec2,
      });

      await provider.createHost({
        name: 'n',
        serverType: 'c5.large',
        location: 'subnet-abc123',
      });

      const command = ec2.sendSpy.mock.calls[0]?.[0];
      expect(command.input.SubnetId).toBe('subnet-abc123');
    });

    it('returns CREATE_FAILED error on API failure', async () => {
      const ec2 = mockEc2Client({
        RunInstances: () => {
          throw new Error('Insufficient capacity');
        },
      });
      const provider = createAwsEc2Provider({
        region: REGION,
        defaultImageId: DEFAULT_IMAGE_ID,
        ec2Client: ec2,
      });

      const result = await provider.createHost({ name: 'bad', serverType: 'c5.large' });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.CREATE_FAILED);
      }
    });
  });

  describe('deleteHost', () => {
    it('resolves on successful termination', async () => {
      const ec2 = mockEc2Client({
        TerminateInstances: () => ({
          TerminatingInstances: [{ InstanceId: 'i-1' }],
        }),
      });
      const provider = createAwsEc2Provider({
        region: REGION,
        defaultImageId: DEFAULT_IMAGE_ID,
        ec2Client: ec2,
      });

      const result = await provider.deleteHost('i-1');

      expect(result.isOk()).toBe(true);
    });

    it('resolves successfully when instance already gone (idempotent)', async () => {
      const ec2 = mockEc2Client({
        TerminateInstances: () => {
          const err = new Error('Not found');
          err.name = 'InvalidInstanceID.NotFound';
          throw err;
        },
      });
      const provider = createAwsEc2Provider({
        region: REGION,
        defaultImageId: DEFAULT_IMAGE_ID,
        ec2Client: ec2,
      });

      const result = await provider.deleteHost('i-gone');

      expect(result.isOk()).toBe(true);
    });

    it('returns DELETE_FAILED error on server error', async () => {
      const ec2 = mockEc2Client({
        TerminateInstances: () => {
          throw new Error('Internal server error');
        },
      });
      const provider = createAwsEc2Provider({
        region: REGION,
        defaultImageId: DEFAULT_IMAGE_ID,
        ec2Client: ec2,
      });

      const result = await provider.deleteHost('i-1');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ProviderErrorCode.DELETE_FAILED);
      }
    });
  });

  describe('status mapping', () => {
    const statusCases: Array<[Ec2InstanceState, string]> = [
      ['pending', 'provisioning'],
      ['running', 'ready'],
      ['shutting-down', 'deleting'],
      ['stopping', 'deleting'],
      ['terminated', 'deleting'],
      ['stopped', 'error'],
    ];

    for (const [ec2State, expectedStatus] of statusCases) {
      it(`maps EC2 '${ec2State}' -> '${expectedStatus}'`, async () => {
        const ec2 = mockEc2Client({
          DescribeInstances: () => ({
            Reservations: [
              {
                Instances: [makeAwsInstance({ State: { Name: ec2State } })],
              },
            ],
          }),
        });
        const provider = createAwsEc2Provider({
          region: REGION,
          defaultImageId: DEFAULT_IMAGE_ID,
          ec2Client: ec2,
        });

        const result = await provider.getHost('i-1');

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.status).toBe(expectedStatus);
        }
      });
    }
  });
});
