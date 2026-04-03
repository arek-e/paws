import { describe, test, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyWebhook } from './webhook-verify.js';

const SECRET = 'test-secret-123';

function hmacSign(payload: string, secret: string = SECRET): string {
  return 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
}

function slackSign(payload: string, secret: string, timestamp: string): string {
  const base = `v0:${timestamp}:${payload}`;
  return 'v0=' + createHmac('sha256', secret).update(base).digest('hex');
}

describe('verifyWebhook', () => {
  describe('hmac-sha256', () => {
    test('valid signature passes', () => {
      const payload = '{"event":"created"}';
      const sig = hmacSign(payload);
      expect(verifyWebhook('hmac-sha256', payload, sig, SECRET)).toBe(true);
    });

    test('raw hex (without sha256= prefix) passes', () => {
      const payload = '{"event":"created"}';
      const hex = createHmac('sha256', SECRET).update(payload).digest('hex');
      expect(verifyWebhook('hmac-sha256', payload, hex, SECRET)).toBe(true);
    });

    test('invalid signature fails', () => {
      const payload = '{"event":"created"}';
      const sig = hmacSign('different payload');
      expect(verifyWebhook('hmac-sha256', payload, sig, SECRET)).toBe(false);
    });

    test('empty signature fails', () => {
      expect(verifyWebhook('hmac-sha256', '{}', '', SECRET)).toBe(false);
    });

    test('empty secret fails', () => {
      expect(verifyWebhook('hmac-sha256', '{}', 'sha256=abc', '')).toBe(false);
    });

    test('undefined signature fails', () => {
      expect(verifyWebhook('hmac-sha256', '{}', undefined, SECRET)).toBe(false);
    });
  });

  describe('slack-v0', () => {
    test('valid signature passes', () => {
      const payload = '{"event":"message"}';
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = slackSign(payload, SECRET, ts);
      expect(
        verifyWebhook('slack-v0', payload, sig, SECRET, {
          'x-slack-request-timestamp': ts,
        }),
      ).toBe(true);
    });

    test('invalid signature fails', () => {
      const ts = String(Math.floor(Date.now() / 1000));
      expect(
        verifyWebhook('slack-v0', '{}', 'v0=invalid', SECRET, {
          'x-slack-request-timestamp': ts,
        }),
      ).toBe(false);
    });

    test('old timestamp fails (replay protection)', () => {
      const payload = '{"event":"message"}';
      const oldTs = String(Math.floor(Date.now() / 1000) - 600); // 10 min ago
      const sig = slackSign(payload, SECRET, oldTs);
      expect(
        verifyWebhook('slack-v0', payload, sig, SECRET, {
          'x-slack-request-timestamp': oldTs,
        }),
      ).toBe(false);
    });

    test('missing timestamp fails', () => {
      expect(verifyWebhook('slack-v0', '{}', 'v0=abc', SECRET, {})).toBe(false);
    });
  });

  describe('none', () => {
    test('always passes', () => {
      expect(verifyWebhook('none', '{}', undefined, '')).toBe(true);
    });

    test('passes with any payload', () => {
      expect(verifyWebhook('none', 'arbitrary data', undefined, '')).toBe(true);
    });
  });
});
