// Provider interface (re-exported for consumers)
export type { CreateHostOptions, Host, HostProvider, HostStatus } from './provider-interface.js';
export { ProviderError, ProviderErrorCode } from './provider-interface.js';

// AWS EC2 provider
export { createAwsEc2Provider } from './provider.js';
export type { AwsEc2Config } from './provider.js';

// AWS EC2 client (for advanced use)
export { createAwsEc2Client } from './client.js';
export type { AwsEc2Client, AwsEc2ClientOptions, Ec2ClientDep } from './client.js';

// AWS EC2 types
export type { CreateInstanceRequest, Ec2Instance, Ec2InstanceState } from './types.js';
