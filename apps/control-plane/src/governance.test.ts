import { describe, expect, test } from 'vitest';

import { createGovernanceChecker } from '@paws/domain-policy';

describe('createGovernanceChecker', () => {
  test('allows actions when no rate limit configured', () => {
    const checker = createGovernanceChecker();
    expect(checker.checkRateLimit('test', { requiresApproval: [], auditLog: true })).toBe(true);
  });

  test('allows actions within rate limit', () => {
    const checker = createGovernanceChecker();
    const gov = { maxActionsPerHour: 3, requiresApproval: [] as string[], auditLog: true };

    expect(checker.checkRateLimit('test', gov)).toBe(true);
    checker.recordAction('test');
    expect(checker.checkRateLimit('test', gov)).toBe(true);
    checker.recordAction('test');
    expect(checker.checkRateLimit('test', gov)).toBe(true);
    checker.recordAction('test');
    // Now at limit
    expect(checker.checkRateLimit('test', gov)).toBe(false);
  });

  test('tracks rate limits per daemon role', () => {
    const checker = createGovernanceChecker();
    const gov = { maxActionsPerHour: 1, requiresApproval: [] as string[], auditLog: true };

    checker.recordAction('daemon-a');
    expect(checker.checkRateLimit('daemon-a', gov)).toBe(false);
    expect(checker.checkRateLimit('daemon-b', gov)).toBe(true);
  });
});
