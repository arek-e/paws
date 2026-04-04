import { z } from 'zod';

import { AgentConfigSchema } from '@paws/domain-agent';
import {
  DurationMsSchema,
  IdSchema,
  NonEmptyStringSchema,
  TimestampSchema,
} from '@paws/domain-common';
import { NetworkConfigSchema } from '@paws/domain-network';
import { GovernanceSchema } from '@paws/domain-policy';
import { ResourcesSchema, SessionStatus, WorkloadSchema } from '@paws/domain-session';

/** Daemon status */
export const DaemonStatus = z.enum(['active', 'paused', 'stopped']);

export type DaemonStatus = z.infer<typeof DaemonStatus>;

/** Webhook trigger — generic, any HTTP POST source */
export const WebhookTriggerSchema = z.object({
  type: z.literal('webhook'),
  events: z.array(NonEmptyStringSchema).default([]),
  /** Which HTTP header carries the signature (e.g., X-Linear-Signature) */
  signatureHeader: z.string().optional(),
  /** Signature verification algorithm */
  signatureScheme: z.enum(['hmac-sha256', 'slack-v0', 'none']).default('hmac-sha256'),
  /** Webhook secret (supports $ENV_VAR credential resolution) */
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

/** GitHub App trigger */
export const GitHubTriggerSchema = z.object({
  type: z.literal('github'),
  repos: z.array(NonEmptyStringSchema).min(1),
  events: z.array(NonEmptyStringSchema).default(['issue_comment']),
  command: z.string().optional(),
});

/** Any trigger type */
export const TriggerSchema = z.discriminatedUnion('type', [
  WebhookTriggerSchema,
  ScheduleTriggerSchema,
  WatchTriggerSchema,
  GitHubTriggerSchema,
]);

export type Trigger = z.infer<typeof TriggerSchema>;

/** Daemon invocation stats */
export const DaemonStatsSchema = z.object({
  totalInvocations: z.number().int().nonnegative(),
  lastInvokedAt: TimestampSchema.optional(),
  avgDurationMs: DurationMsSchema.optional(),
  /** Cumulative vCPU-seconds across all completed sessions */
  totalVcpuSeconds: z.number().nonnegative().optional(),
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
export const CreateDaemonRequestSchema = z
  .object({
    role: NonEmptyStringSchema,
    description: z.string().default(''),
    snapshot: NonEmptyStringSchema,
    trigger: TriggerSchema,
    /** Workspace this daemon belongs to */
    workspace: z.string().optional(),
    /** Workload script — required unless agent is configured */
    workload: WorkloadSchema.optional(),
    /** Agent framework config — auto-generates the workload script */
    agent: AgentConfigSchema.optional(),
    resources: ResourcesSchema.optional(),
    network: NetworkConfigSchema.optional(),
    governance: GovernanceSchema.optional(),
  })
  .refine((data) => data.workload || data.agent, {
    message: 'Either workload or agent must be provided',
  });

export type CreateDaemonRequest = z.infer<typeof CreateDaemonRequestSchema>;

/** Input type (defaults are optional) — use in SDKs and client code */
export type CreateDaemonInput = z.input<typeof CreateDaemonRequestSchema>;

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
  workspace: z.string().optional(),
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
