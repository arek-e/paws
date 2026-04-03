import { createHmac, timingSafeEqual } from 'node:crypto';

export type SignatureScheme = 'hmac-sha256' | 'slack-v0' | 'none';

/**
 * Verify a webhook signature using the declared scheme.
 *
 * @returns true if valid, false if invalid
 */
export function verifyWebhook(
  scheme: SignatureScheme,
  payload: string,
  signature: string | undefined,
  secret: string,
  headers?: Record<string, string | undefined>,
): boolean {
  switch (scheme) {
    case 'none':
      return true;

    case 'hmac-sha256':
      return verifyHmacSha256(payload, signature ?? '', secret);

    case 'slack-v0':
      return verifySlackV0(
        payload,
        signature ?? '',
        secret,
        headers?.['x-slack-request-timestamp'] ?? '',
      );

    default:
      return false;
  }
}

/**
 * HMAC-SHA256 verification — used by GitHub, Linear, Stripe, PagerDuty.
 * Signature format: "sha256=<hex>" or raw "<hex>"
 */
function verifyHmacSha256(payload: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;

  const computed = createHmac('sha256', secret).update(payload).digest('hex');
  const expected = `sha256=${computed}`;

  // Accept both "sha256=<hex>" and raw "<hex>" formats
  const sig = signature.startsWith('sha256=') ? signature : `sha256=${signature}`;

  if (expected.length !== sig.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

/**
 * Slack v0 verification — Slack's custom signing scheme.
 * Signature format: "v0=<sha256 hex>"
 * Signs: "v0:<timestamp>:<body>"
 */
function verifySlackV0(
  payload: string,
  signature: string,
  secret: string,
  timestamp: string,
): boolean {
  if (!signature || !secret || !timestamp) return false;

  // Reject requests older than 5 minutes (replay protection)
  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const baseString = `v0:${timestamp}:${payload}`;
  const computed = `v0=${createHmac('sha256', secret).update(baseString).digest('hex')}`;

  if (computed.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}
