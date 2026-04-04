/** Event from a @paws mention in a comment */
export interface GitHubMentionEvent {
  type: 'mention';
  command: string;
  repo: string;
  sender: string;
  installationId: number;
  prNumber?: number | undefined;
  commentUrl: string;
  issueUrl: string;
}

/** Event from a pull_request webhook (opened, synchronize, reopened) */
export interface GitHubPullRequestEvent {
  type: 'pull_request';
  action: string;
  repo: string;
  sender: string;
  installationId: number;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  prHtmlUrl: string;
  headBranch: string;
  baseBranch: string;
  issueUrl: string;
}

/** Any parsed GitHub event */
export type GitHubEvent = GitHubMentionEvent | GitHubPullRequestEvent;

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
  workspace?: string | undefined;
  snapshot: string;
  workload: { type: string; script: string; env: Record<string, string> };
  resources?: { vcpus: number; memoryMB: number };
  network?: unknown;
  governance?: unknown;
}
