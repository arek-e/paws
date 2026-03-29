import { z } from 'zod';

import {
  DurationMsSchema,
  IdSchema,
  MetadataSchema,
  NonEmptyStringSchema,
  TimestampSchema,
} from './common.js';
import { NetworkConfigSchema } from './network.js';

/** Session status lifecycle */
export const SessionStatus = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'timeout',
  'cancelled',
]);

export type SessionStatus = z.infer<typeof SessionStatus>;

/** VM resource allocation */
export const ResourcesSchema = z.object({
  vcpus: z.number().int().min(1).max(8).default(2),
  memoryMB: z.number().int().min(256).max(16384).default(4096),
});

export type Resources = z.infer<typeof ResourcesSchema>;

/** Workload definition (script-only for v0.1) */
export const WorkloadSchema = z.object({
  type: z.literal('script'),
  script: NonEmptyStringSchema,
  env: z.record(z.string(), z.string()).default({}),
});

export type Workload = z.infer<typeof WorkloadSchema>;

/** Create session request */
export const CreateSessionRequestSchema = z.object({
  snapshot: NonEmptyStringSchema,
  workload: WorkloadSchema,
  resources: ResourcesSchema.optional(),
  timeoutMs: DurationMsSchema.default(600_000),
  network: NetworkConfigSchema.optional(),
  callbackUrl: z.string().url().optional(),
  metadata: MetadataSchema.optional(),
});

export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

/** Input type (defaults are optional) — use in SDKs and client code */
export type CreateSessionInput = z.input<typeof CreateSessionRequestSchema>;

/** Create session response (202) */
export const CreateSessionResponseSchema = z.object({
  sessionId: IdSchema,
  status: z.literal('pending'),
});

export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;

/** A port exposed from the VM via Pangolin tunnel */
export const ExposedPortSchema = z.object({
  /** Port number inside the VM */
  port: z.number().int().min(1).max(65535),
  /** Public URL to access this port */
  url: z.string().url(),
  /** Human-readable label */
  label: z.string().optional(),
  /** Access control mode used for this port */
  access: z.enum(['sso', 'pin', 'email']).optional(),
  /** Auto-generated PIN (only present when access is 'pin') */
  pin: z.string().optional(),
  /** Time-limited shareable link (always generated) */
  shareLink: z.string().url().optional(),
});

export type ExposedPort = z.infer<typeof ExposedPortSchema>;

/** Full session state (GET response) */
export const SessionSchema = z.object({
  sessionId: IdSchema,
  status: SessionStatus,
  exitCode: z.number().int().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  output: z.unknown().optional(),
  startedAt: TimestampSchema.optional(),
  completedAt: TimestampSchema.optional(),
  durationMs: DurationMsSchema.optional(),
  worker: z.string().optional(),
  metadata: MetadataSchema.optional(),
  /** VM resources allocated for this session */
  resources: ResourcesSchema.optional(),
  /** Cost in vCPU-seconds (vcpus × durationSec) — set on completion */
  vcpuSeconds: z.number().nonnegative().optional(),
  /** Ports exposed from the VM via Pangolin tunnel */
  exposedPorts: z.array(ExposedPortSchema).optional(),
});

export type Session = z.infer<typeof SessionSchema>;

/** Cancel session response */
/** List sessions response */
export const SessionListResponseSchema = z.object({
  sessions: z.array(SessionSchema),
});

export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;

export const CancelSessionResponseSchema = z.object({
  sessionId: IdSchema,
  status: z.literal('cancelled'),
});

export type CancelSessionResponse = z.infer<typeof CancelSessionResponseSchema>;
