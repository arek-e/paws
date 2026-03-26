import { describe, expect, test } from 'vitest';

import {
  CreateDaemonRequestSchema,
  CreateDaemonResponseSchema,
  DaemonDetailSchema,
  DaemonListItemSchema,
  DaemonListResponseSchema,
  DaemonSessionSummarySchema,
  DaemonStatsSchema,
  DaemonStatus,
  GovernanceSchema,
  ScheduleTriggerSchema,
  TriggerSchema,
  UpdateDaemonRequestSchema,
  WatchTriggerSchema,
  WebhookTriggerResponseSchema,
  WebhookTriggerSchema,
} from './daemon.js';

describe('DaemonStatus', () => {
  test('accepts valid statuses', () => {
    for (const s of ['active', 'paused', 'stopped'] as const) {
      expect(DaemonStatus.parse(s)).toBe(s);
    }
  });

  test('rejects invalid status', () => {
    expect(() => DaemonStatus.parse('unknown')).toThrow();
  });
});

describe('TriggerSchema', () => {
  test('accepts webhook trigger', () => {
    const result = TriggerSchema.parse({
      type: 'webhook',
      events: ['pull_request.opened'],
      secret: 'whsec_123',
    });
    expect(result.type).toBe('webhook');
  });

  test('accepts schedule trigger', () => {
    const result = TriggerSchema.parse({
      type: 'schedule',
      cron: '0 */6 * * *',
    });
    expect(result.type).toBe('schedule');
  });

  test('accepts watch trigger', () => {
    const result = TriggerSchema.parse({
      type: 'watch',
      condition: 'github:org/repo:open_prs > 5',
    });
    expect(result.type).toBe('watch');
    if (result.type === 'watch') {
      expect(result.intervalMs).toBe(60_000);
    }
  });

  test('rejects unknown trigger type', () => {
    expect(() => TriggerSchema.parse({ type: 'email' })).toThrow();
  });
});

describe('WebhookTriggerSchema', () => {
  test('rejects empty events array', () => {
    expect(() => WebhookTriggerSchema.parse({ type: 'webhook', events: [] })).toThrow();
  });
});

describe('ScheduleTriggerSchema', () => {
  test('rejects empty cron', () => {
    expect(() => ScheduleTriggerSchema.parse({ type: 'schedule', cron: '' })).toThrow();
  });
});

describe('WatchTriggerSchema', () => {
  test('accepts custom interval', () => {
    const result = WatchTriggerSchema.parse({
      type: 'watch',
      condition: 'check something',
      intervalMs: 30_000,
    });
    expect(result.intervalMs).toBe(30_000);
  });
});

describe('GovernanceSchema', () => {
  test('accepts full governance config', () => {
    const result = GovernanceSchema.parse({
      maxActionsPerHour: 20,
      requiresApproval: ['merge', 'deploy'],
      auditLog: true,
    });
    expect(result.maxActionsPerHour).toBe(20);
    expect(result.requiresApproval).toEqual(['merge', 'deploy']);
  });

  test('applies defaults', () => {
    const result = GovernanceSchema.parse({});
    expect(result.requiresApproval).toEqual([]);
    expect(result.auditLog).toBe(true);
    expect(result.maxActionsPerHour).toBeUndefined();
  });
});

describe('DaemonStatsSchema', () => {
  test('accepts full stats', () => {
    const result = DaemonStatsSchema.parse({
      totalInvocations: 42,
      lastInvokedAt: '2026-03-26T09:30:00Z',
      avgDurationMs: 45000,
    });
    expect(result.totalInvocations).toBe(42);
  });

  test('accepts minimal stats', () => {
    const result = DaemonStatsSchema.parse({ totalInvocations: 0 });
    expect(result.lastInvokedAt).toBeUndefined();
  });
});

describe('DaemonSessionSummarySchema', () => {
  test('accepts valid summary', () => {
    const result = DaemonSessionSummarySchema.parse({
      sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      triggeredAt: '2026-03-26T09:30:00Z',
      status: 'completed',
      durationMs: 45000,
    });
    expect(result.status).toBe('completed');
  });
});

describe('CreateDaemonRequestSchema', () => {
  const validRequest = {
    role: 'pr-helper',
    snapshot: 'claude-agent',
    trigger: { type: 'webhook' as const, events: ['pull_request.opened'] },
    workload: { type: 'script' as const, script: 'echo hello' },
  };

  test('accepts minimal request', () => {
    const result = CreateDaemonRequestSchema.parse(validRequest);
    expect(result.role).toBe('pr-helper');
    expect(result.description).toBe('');
  });

  test('accepts full request', () => {
    const result = CreateDaemonRequestSchema.parse({
      ...validRequest,
      description: 'Review PRs',
      resources: { vcpus: 4, memoryMB: 8192 },
      network: { allowOut: ['api.anthropic.com'] },
      governance: { maxActionsPerHour: 20 },
    });
    expect(result.description).toBe('Review PRs');
  });

  test('rejects missing role', () => {
    const { role: _, ...noRole } = validRequest;
    expect(() => CreateDaemonRequestSchema.parse(noRole)).toThrow();
  });
});

describe('CreateDaemonResponseSchema', () => {
  test('accepts valid response', () => {
    const result = CreateDaemonResponseSchema.parse({
      role: 'pr-helper',
      status: 'active',
      createdAt: '2026-03-26T10:00:00Z',
    });
    expect(result.status).toBe('active');
  });
});

describe('DaemonListItemSchema', () => {
  test('accepts valid list item', () => {
    const result = DaemonListItemSchema.parse({
      role: 'pr-helper',
      description: 'Review PRs',
      status: 'active',
      trigger: { type: 'webhook', events: ['pull_request.opened'] },
      stats: { totalInvocations: 42 },
    });
    expect(result.role).toBe('pr-helper');
  });
});

describe('DaemonListResponseSchema', () => {
  test('accepts valid list', () => {
    const result = DaemonListResponseSchema.parse({
      daemons: [
        {
          role: 'pr-helper',
          description: 'Review PRs',
          status: 'active',
          trigger: { type: 'webhook', events: ['pull_request.opened'] },
          stats: { totalInvocations: 0 },
        },
      ],
    });
    expect(result.daemons).toHaveLength(1);
  });

  test('accepts empty list', () => {
    const result = DaemonListResponseSchema.parse({ daemons: [] });
    expect(result.daemons).toEqual([]);
  });
});

describe('DaemonDetailSchema', () => {
  test('accepts full detail', () => {
    const result = DaemonDetailSchema.parse({
      role: 'pr-helper',
      description: 'Review PRs',
      status: 'active',
      trigger: { type: 'webhook', events: ['pull_request.opened'] },
      stats: { totalInvocations: 42 },
      governance: { auditLog: true },
      recentSessions: [
        {
          sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          triggeredAt: '2026-03-26T09:30:00Z',
          status: 'completed',
          durationMs: 45000,
        },
      ],
    });
    expect(result.recentSessions).toHaveLength(1);
  });
});

describe('UpdateDaemonRequestSchema', () => {
  test('accepts partial update', () => {
    const result = UpdateDaemonRequestSchema.parse({
      governance: { maxActionsPerHour: 50 },
    });
    expect(result.governance?.maxActionsPerHour).toBe(50);
  });

  test('rejects empty update', () => {
    expect(() => UpdateDaemonRequestSchema.parse({})).toThrow();
  });
});

describe('WebhookTriggerResponseSchema', () => {
  test('accepts valid response', () => {
    const result = WebhookTriggerResponseSchema.parse({
      accepted: true,
      sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
    expect(result.accepted).toBe(true);
  });
});
