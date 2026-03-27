/**
 * Tier 3: VM restore integration test
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

describe('VM restore (Tier 3)', () => {
  test.todo('restores VM from test-minimal snapshot in <1s');
  test.todo('restored VM responds to SSH within 5s');
  test.todo('script execution returns stdout/stderr');
  test.todo('VM stop kills process and cleans up');
  test.todo('TAP device is removed after VM stop');
  test.todo('iptables rules are cleaned up after VM stop');
});
