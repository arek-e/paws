import { z } from 'zod';

export const ServerStatus = z.enum([
  'provisioning',
  'waiting_ssh',
  'bootstrapping',
  'registering',
  'ready',
  'error',
]);
export type ServerStatus = z.infer<typeof ServerStatus>;

export const ServerProvider = z.enum(['manual', 'aws-ec2']);
export type ServerProvider = z.infer<typeof ServerProvider>;

export const ServerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  ip: z.string(),
  status: ServerStatus,
  provider: ServerProvider,
  providerServerId: z.string().optional(),
  sshPublicKey: z.string(),
  sshPrivateKeyEncrypted: z.string(),
  createdAt: z.string().datetime(),
  error: z.string().optional(),
  // AWS EC2 resource tracking (only set for aws-ec2 provider)
  awsRegion: z.string().optional(),
  awsSecurityGroupId: z.string().optional(),
  awsKeyPairName: z.string().optional(),
  awsCredentialsEncrypted: z.string().optional(),
});
export type Server = z.infer<typeof ServerSchema>;

export interface ProvisionerEvent {
  serverId: string;
  stage: ServerStatus;
  message: string;
  progress?: number; // 0-100
  error?: string;
}

export interface ProvisionerDeps {
  /** SSH operations - injected for testability */
  ssh: SshClient;
  /** Callback when server state changes */
  onEvent: (event: ProvisionerEvent) => void;
}

export interface SshClient {
  connect(opts: {
    host: string;
    port?: number;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
  }): Promise<void>;
  exec(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  /** Execute a command and stream stdout/stderr line-by-line via callback */
  execStream(command: string, onLine: (line: string) => void): Promise<{ exitCode: number }>;
  /** Copy a file to the remote server */
  scp(localPath: string, remotePath: string): Promise<void>;
  disconnect(): void;
}
