import { describe, test, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature, parsePawsMention, parseWebhookEvent } from './github.js';

const SECRET = 'test-webhook-secret';

function sign(payload: string): string {
  return 'sha256=' + createHmac('sha256', SECRET).update(payload).digest('hex');
}

function makeWebhookPayload(overrides: Record<string, unknown> = {}) {
  return {
    action: 'created',
    comment: {
      body: '@paws review this PR',
      url: 'https://api.github.com/repos/org/repo/issues/comments/1',
    },
    issue: {
      number: 42,
      pull_request: { url: 'https://api.github.com/repos/org/repo/pulls/42' },
      url: 'https://api.github.com/repos/org/repo/issues/42',
    },
    repository: { full_name: 'org/repo' },
    sender: { login: 'alice' },
    installation: { id: 12345 },
    ...overrides,
  };
}

describe('verifyWebhookSignature', () => {
  test('valid signature returns true', () => {
    const payload = '{"test": true}';
    const sig = sign(payload);
    expect(verifyWebhookSignature(payload, sig, SECRET)).toBe(true);
  });

  test('invalid signature returns false', () => {
    const payload = '{"test": true}';
    const sig = sign('different payload');
    expect(verifyWebhookSignature(payload, sig, SECRET)).toBe(false);
  });

  test('wrong length signature returns false', () => {
    const payload = '{"test": true}';
    expect(verifyWebhookSignature(payload, 'sha256=short', SECRET)).toBe(false);
  });
});

describe('parsePawsMention', () => {
  test('extracts command from "@paws review this PR"', () => {
    expect(parsePawsMention('@paws review this PR')).toBe('review this PR');
  });

  test('extracts command case-insensitively', () => {
    expect(parsePawsMention('@PAWS do something')).toBe('do something');
  });

  test('returns null when no @paws mention', () => {
    expect(parsePawsMention('just a regular comment')).toBeNull();
  });
});

describe('parseWebhookEvent', () => {
  test('parses valid issue_comment with @paws mention', () => {
    const event = parseWebhookEvent(makeWebhookPayload());
    expect(event).toEqual({
      type: 'mention',
      command: 'review this PR',
      repo: 'org/repo',
      sender: 'alice',
      installationId: 12345,
      prNumber: 42,
      commentUrl: 'https://api.github.com/repos/org/repo/issues/comments/1',
      issueUrl: 'https://api.github.com/repos/org/repo/issues/42',
    });
  });

  test('returns null for comment without @paws', () => {
    const payload = makeWebhookPayload({
      comment: {
        body: 'just a normal comment',
        url: 'https://api.github.com/repos/org/repo/issues/comments/1',
      },
    });
    expect(parseWebhookEvent(payload)).toBeNull();
  });

  test('returns null for action !== created', () => {
    const payload = makeWebhookPayload({ action: 'edited' });
    expect(parseWebhookEvent(payload)).toBeNull();
  });

  test('detects PR context from issue.pull_request field', () => {
    // With pull_request field -> prNumber set
    const prPayload = makeWebhookPayload();
    const prEvent = parseWebhookEvent(prPayload);
    expect(prEvent?.prNumber).toBe(42);

    // Without pull_request field -> prNumber undefined
    const issuePayload = makeWebhookPayload({
      issue: {
        number: 10,
        url: 'https://api.github.com/repos/org/repo/issues/10',
      },
    });
    const issueEvent = parseWebhookEvent(issuePayload);
    expect(issueEvent?.prNumber).toBeUndefined();
  });
});
