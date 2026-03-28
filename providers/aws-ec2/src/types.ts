/**
 * AWS EC2 API types used by the client.
 * These mirror the relevant shapes from @aws-sdk/client-ec2 so the rest
 * of the provider can stay decoupled from the SDK import.
 */

/** EC2 instance states */
export type Ec2InstanceState =
  | 'pending'
  | 'running'
  | 'shutting-down'
  | 'terminated'
  | 'stopping'
  | 'stopped';

export interface Ec2Instance {
  instanceId: string;
  name: string;
  state: Ec2InstanceState;
  instanceType: string;
  publicIpV4: string | null;
  publicIpV6: string | null;
  availabilityZone: string;
  launchTime: string;
  tags: Record<string, string>;
}

export interface CreateInstanceRequest {
  name: string;
  instanceType: string;
  imageId: string;
  keyName?: string;
  securityGroupIds?: string[];
  subnetId?: string;
  userData?: string;
}
