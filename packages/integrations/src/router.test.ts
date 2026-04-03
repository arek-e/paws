import { describe, test, expect } from 'vitest';
import { matchDaemon } from './router.js';
import type { GitHubMentionEvent, GitHubDaemon } from './types.js';

function makeEvent(overrides: Partial<GitHubMentionEvent> = {}): GitHubMentionEvent {
  return {
    type: 'mention',
    command: 'review this PR',
    repo: 'org/repo',
    sender: 'alice',
    installationId: 12345,
    commentUrl: 'https://api.github.com/repos/org/repo/issues/comments/1',
    issueUrl: 'https://api.github.com/repos/org/repo/issues/42',
    ...overrides,
  };
}

function makeDaemon(overrides: Partial<GitHubDaemon> = {}): GitHubDaemon {
  return {
    role: 'reviewer',
    trigger: {
      type: 'github',
      repos: ['org/repo'],
      events: ['issue_comment'],
      command: 'review',
    },
    snapshot: 'agent-latest',
    workload: { type: 'script', script: 'echo hi', env: {} },
    ...overrides,
  };
}

describe('matchDaemon', () => {
  test('matches by exact repo + command', () => {
    const daemon = makeDaemon();
    const event = makeEvent({ command: 'review this PR' });
    const result = matchDaemon(event, [daemon]);
    expect(result).toEqual({ daemon, event });
  });

  test('matches wildcard repo', () => {
    const daemon = makeDaemon({
      trigger: { type: 'github', repos: ['*'], events: ['issue_comment'], command: 'review' },
    });
    const event = makeEvent({ repo: 'any/repo', command: 'review please' });
    const result = matchDaemon(event, [daemon]);
    expect(result).toEqual({ daemon, event });
  });

  test('prefers exact repo over wildcard', () => {
    const wildcard = makeDaemon({
      role: 'wildcard-reviewer',
      trigger: { type: 'github', repos: ['*'], events: ['issue_comment'], command: 'review' },
    });
    const exact = makeDaemon({
      role: 'exact-reviewer',
      trigger: {
        type: 'github',
        repos: ['org/repo'],
        events: ['issue_comment'],
        command: 'review',
      },
    });
    const event = makeEvent({ command: 'review this' });
    const result = matchDaemon(event, [wildcard, exact]);
    expect(result?.daemon.role).toBe('exact-reviewer');
  });

  test('matches daemon role when no command specified', () => {
    const daemon = makeDaemon({
      role: 'deploy',
      trigger: { type: 'github', repos: ['org/repo'], events: ['issue_comment'] },
    });
    const event = makeEvent({ command: 'deploy to staging' });
    const result = matchDaemon(event, [daemon]);
    expect(result).toEqual({ daemon, event });
  });

  test('returns null when no match', () => {
    const daemon = makeDaemon();
    const event = makeEvent({ command: 'deploy something' });
    const result = matchDaemon(event, [daemon]);
    expect(result).toBeNull();
  });

  test('case-insensitive command matching', () => {
    const daemon = makeDaemon();
    const event = makeEvent({ command: 'REVIEW this PR' });
    const result = matchDaemon(event, [daemon]);
    expect(result).toEqual({ daemon, event });
  });

  test('matches pull_request event by type + repo', () => {
    const daemon = makeDaemon({
      role: 'pr-reviewer',
      trigger: {
        type: 'github',
        repos: ['org/repo'],
        events: ['pull_request'],
      },
    });
    const event = {
      type: 'pull_request' as const,
      action: 'opened',
      repo: 'org/repo',
      sender: 'bob',
      installationId: 67890,
      prNumber: 99,
      prTitle: 'Add dark mode',
      prUrl: 'https://api.github.com/repos/org/repo/pulls/99',
      prHtmlUrl: 'https://github.com/org/repo/pull/99',
      headBranch: 'feat/dark-mode',
      baseBranch: 'main',
      issueUrl: 'https://api.github.com/repos/org/repo/issues/99',
    };
    const result = matchDaemon(event, [daemon]);
    expect(result?.daemon.role).toBe('pr-reviewer');
  });

  test('does not match pull_request event against mention-only daemon', () => {
    const daemon = makeDaemon({
      trigger: {
        type: 'github',
        repos: ['org/repo'],
        events: ['issue_comment'],
        command: 'review',
      },
    });
    const event = {
      type: 'pull_request' as const,
      action: 'opened',
      repo: 'org/repo',
      sender: 'bob',
      installationId: 1,
      prNumber: 1,
      prTitle: 'Test',
      prUrl: '',
      prHtmlUrl: '',
      headBranch: 'feat',
      baseBranch: 'main',
      issueUrl: '',
    };
    expect(matchDaemon(event, [daemon])).toBeNull();
  });

  test('daemon can listen to both mention and pull_request events', () => {
    const daemon = makeDaemon({
      role: 'all-rounder',
      trigger: {
        type: 'github',
        repos: ['org/repo'],
        events: ['issue_comment', 'pull_request'],
        command: 'review',
      },
    });

    const mentionEvent = makeEvent({ command: 'review this' });
    expect(matchDaemon(mentionEvent, [daemon])?.daemon.role).toBe('all-rounder');

    const prEvent = {
      type: 'pull_request' as const,
      action: 'opened',
      repo: 'org/repo',
      sender: 'bob',
      installationId: 1,
      prNumber: 1,
      prTitle: 'Test',
      prUrl: '',
      prHtmlUrl: '',
      headBranch: 'feat',
      baseBranch: 'main',
      issueUrl: '',
    };
    expect(matchDaemon(prEvent, [daemon])?.daemon.role).toBe('all-rounder');
  });
});
