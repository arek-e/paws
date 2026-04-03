import { createHmac, timingSafeEqual } from 'node:crypto';
import type { GitHubEvent, GitHubMentionEvent, GitHubPullRequestEvent } from './types.js';

/** Verify GitHub webhook signature */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/** Parse @paws mention from comment body, extract command */
export function parsePawsMention(body: string): string | null {
  const match = body.match(/@paws\s+(.*)/i);
  if (!match) return null;
  return match[1]!.trim();
}

/** Parse an issue_comment webhook into a mention event */
function parseIssueComment(payload: Record<string, unknown>): GitHubMentionEvent | null {
  const action = payload.action as string;
  if (action !== 'created') return null;

  const comment = payload.comment as Record<string, unknown>;
  const issue = payload.issue as Record<string, unknown>;
  const repo = payload.repository as Record<string, unknown>;
  const sender = payload.sender as Record<string, unknown>;
  const installation = payload.installation as Record<string, unknown>;

  if (!comment || !issue || !repo || !sender || !installation) return null;

  const body = comment.body as string;
  const command = parsePawsMention(body);
  if (!command) return null;

  const fullName = repo.full_name as string;
  const prNumber = issue.pull_request ? (issue.number as number) : undefined;

  return {
    type: 'mention',
    command,
    repo: fullName,
    sender: sender.login as string,
    installationId: installation.id as number,
    prNumber,
    commentUrl: comment.url as string,
    issueUrl: issue.url as string,
  };
}

const PR_ACTIONS = new Set(['opened', 'synchronize', 'reopened']);

/** Parse a pull_request webhook into a PR event */
function parsePullRequest(payload: Record<string, unknown>): GitHubPullRequestEvent | null {
  const action = payload.action as string;
  if (!PR_ACTIONS.has(action)) return null;

  const pr = payload.pull_request as Record<string, unknown>;
  const repo = payload.repository as Record<string, unknown>;
  const sender = payload.sender as Record<string, unknown>;
  const installation = payload.installation as Record<string, unknown>;

  if (!pr || !repo || !sender || !installation) return null;

  const fullName = repo.full_name as string;
  const head = pr.head as Record<string, unknown>;
  const base = pr.base as Record<string, unknown>;

  return {
    type: 'pull_request',
    action,
    repo: fullName,
    sender: sender.login as string,
    installationId: installation.id as number,
    prNumber: pr.number as number,
    prTitle: pr.title as string,
    prUrl: pr.url as string,
    prHtmlUrl: pr.html_url as string,
    headBranch: (head?.ref as string) ?? '',
    baseBranch: (base?.ref as string) ?? '',
    issueUrl: (pr.issue_url as string) ?? `${repo.url as string}/issues/${pr.number}`,
  };
}

/** Parse a GitHub webhook into a GitHubEvent (or null if not relevant) */
export function parseWebhookEvent(
  payload: Record<string, unknown>,
  webhookEvent?: string,
): GitHubEvent | null {
  // Use the X-GitHub-Event header if provided, otherwise infer from payload shape
  const eventType = webhookEvent ?? (payload.pull_request ? 'pull_request' : 'issue_comment');

  if (eventType === 'pull_request') return parsePullRequest(payload);
  if (eventType === 'issue_comment') return parseIssueComment(payload);
  return null;
}
