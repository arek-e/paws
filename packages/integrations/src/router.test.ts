import { describe, test, expect } from 'vitest';
import { matchDaemon } from './router.js';
import type { GitHubEvent, GitHubDaemon } from './types.js';

function makeEvent(overrides: Partial<GitHubEvent> = {}): GitHubEvent {
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
});
