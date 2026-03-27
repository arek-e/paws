/**
 * Tier 2: iptables rule integration test
 *
 * Requires:
 * - Linux
 * - Root access
 * - iptables installed
 *
 * Run via: bun test:integration
 */
import { describe, test } from 'vitest';

describe('iptables rule management (Tier 2)', () => {
  test.todo('adds DNAT rules for HTTP/HTTPS to proxy');
  test.todo('adds FORWARD ACCEPT rule for proxy traffic');
  test.todo('adds FORWARD DROP rule for all other traffic');
  test.todo('teardown removes all rules for a TAP device');
  test.todo('teardown is idempotent');
});
