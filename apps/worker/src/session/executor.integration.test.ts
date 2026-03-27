/**
 * Tier 3: Full session executor integration test
 *
 * Requires:
 * - Linux with /dev/kvm
 * - Root access
 * - Firecracker binary installed
 * - Test snapshot at /var/lib/paws/snapshots/test-minimal/
 *
 * Run via: bun run test:vm:remote
 */
import { describe, test } from 'vitest';

describe('Session executor (Tier 3)', () => {
  test.todo('executes script workload in VM and returns result');
  test.todo('captures stdout, stderr, and exit code');
  test.todo('reads /output/result.json from VM');
  test.todo('cleans up VM, TAP, iptables, and proxy on success');
  test.todo('cleans up VM, TAP, iptables, and proxy on failure');
  test.todo('respects semaphore concurrency limits');
  test.todo('VM cannot reach non-allowlisted domains');
  test.todo('VM can reach allowlisted domains with injected credentials');
  test.todo('session CA is injected into VM trust store');
});
