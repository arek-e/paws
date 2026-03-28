/** Event from GitHub webhook parsed for paws consumption */
export interface GitHubEvent {
  type: 'mention';
  command: string;
  repo: string;
  sender: string;
  installationId: number;
  prNumber?: number | undefined;
  commentUrl: string;
  issueUrl: string;
}

/** Config for the GitHub integration */
export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  webhookSecret: string;
}

/** Daemon with a GitHub trigger (type-narrowed) */
export interface GitHubDaemon {
  role: string;
  trigger: {
    type: 'github';
    repos: string[];
    events: string[];
    command?: string;
  };
  snapshot: string;
  workload: { type: string; script: string; env: Record<string, string> };
  resources?: { vcpus: number; memoryMB: number };
  network?: unknown;
  governance?: unknown;
}
