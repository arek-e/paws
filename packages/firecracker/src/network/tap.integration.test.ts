/**
 * Tier 2: TAP device integration test
 *
 * Requires:
 * - Linux
 * - Root access (or CAP_NET_ADMIN)
 *
 * Run via: bun test:integration
 */
import { describe, test } from 'vitest';

describe('TAP device management (Tier 2)', () => {
  test.todo('creates TAP device with correct name');
  test.todo('assigns host IP to TAP device');
  test.todo('brings TAP device up');
  test.todo('deletes TAP device');
  test.todo('is idempotent on delete of non-existent TAP');
});
