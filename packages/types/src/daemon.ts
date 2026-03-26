import { z } from 'zod';

import { DurationMsSchema, IdSchema, NonEmptyStringSchema, TimestampSchema } from './common.js';
import { NetworkConfigSchema } from './network.js';
import { ResourcesSchema, SessionStatus, WorkloadSchema } from './session.js';

/** Daemon status */
export const DaemonStatus = z.enum(['active', 'paused', 'stopped']);

export type DaemonStatus = z.infer<typeof DaemonStatus>;

/** Webhook trigger */
export const WebhookTriggerSchema = z.object({
  type: z.literal('webhook'),
  events: z.array(NonEmptyStringSchema).min(1),
  secret: z.string().optional(),
});

/** Schedule (cron) trigger */
export const ScheduleTriggerSchema = z.object({
  type: z.literal('schedule'),
  cron: NonEmptyStringSchema,
});

/** Watch (polling) trigger */
export const WatchTriggerSchema = z.object({
  type: z.literal('watch'),
  condition: NonEmptyStringSchema,
  intervalMs: DurationMsSchema.default(60_000),
});

/** Any trigger type */
export const TriggerSchema = z.discriminatedUnion('type', [
  WebhookTriggerSchema,
  ScheduleTriggerSchema,
  WatchTriggerSchema,
]);

export type Trigger = z.infer<typeof TriggerSchema>;

/** Governance policy */
export const GovernanceSchema = z.object({
  maxActionsPerHour: z.number().int().positive().optional(),
  requiresApproval: z.array(z.string()).default([]),
  auditLog: z.boolean().default(true),
});

export type Governance = z.infer<typeof GovernanceSchema>;

/** Daemon invocation stats */
export const DaemonStatsSchema = z.object({
  totalInvocations: z.number().int().nonnegative(),
  lastInvokedAt: TimestampSchema.optional(),
  avgDurationMs: DurationMsSchema.optional(),
});

export type DaemonStats = z.infer<typeof DaemonStatsSchema>;

/** Recent session summary (shown in daemon detail) */
export const DaemonSessionSummarySchema = z.object({
  sessionId: IdSchema,
  triggeredAt: TimestampSchema,
  status: SessionStatus,
  durationMs: DurationMsSchema.optional(),
});

export type DaemonSessionSummary = z.infer<typeof DaemonSessionSummarySchema>;

/** Register daemon request */
export const CreateDaemonRequestSchema = z.object({
  role: NonEmptyStringSchema,
  description: z.string().default(''),
  snapshot: NonEmptyStringSchema,
  trigger: TriggerSchema,
  workload: WorkloadSchema,
  resources: ResourcesSchema.optional(),
  network: NetworkConfigSchema.optional(),
  governance: GovernanceSchema.optional(),
});

export type CreateDaemonRequest = z.infer<typeof CreateDaemonRequestSchema>;

/** Register daemon response (201) */
export const CreateDaemonResponseSchema = z.object({
  role: NonEmptyStringSchema,
  status: z.literal('active'),
  createdAt: TimestampSchema,
});

export type CreateDaemonResponse = z.infer<typeof CreateDaemonResponseSchema>;

/** Daemon list item */
export const DaemonListItemSchema = z.object({
  role: NonEmptyStringSchema,
  description: z.string(),
  status: DaemonStatus,
  trigger: TriggerSchema,
  stats: DaemonStatsSchema,
});

export type DaemonListItem = z.infer<typeof DaemonListItemSchema>;

/** List daemons response */
export const DaemonListResponseSchema = z.object({
  daemons: z.array(DaemonListItemSchema),
});

export type DaemonListResponse = z.infer<typeof DaemonListResponseSchema>;

/** Full daemon detail (GET /v1/daemons/:role) */
export const DaemonDetailSchema = DaemonListItemSchema.extend({
  governance: GovernanceSchema,
  recentSessions: z.array(DaemonSessionSummarySchema),
});

export type DaemonDetail = z.infer<typeof DaemonDetailSchema>;

/** Update daemon request (partial) */
export const UpdateDaemonRequestSchema = z
  .object({
    description: z.string().optional(),
    trigger: TriggerSchema.optional(),
    workload: WorkloadSchema.optional(),
    resources: ResourcesSchema.optional(),
    network: NetworkConfigSchema.optional(),
    governance: GovernanceSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateDaemonRequest = z.infer<typeof UpdateDaemonRequestSchema>;

/** Webhook trigger response (202) */
export const WebhookTriggerResponseSchema = z.object({
  accepted: z.literal(true),
  sessionId: IdSchema,
});

export type WebhookTriggerResponse = z.infer<typeof WebhookTriggerResponseSchema>;
