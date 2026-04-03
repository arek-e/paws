import { z } from 'zod';

import { NonEmptyStringSchema, TimestampSchema } from '@paws/domain-common';
import { ResourcesSchema } from '@paws/domain-session';

/** Snapshot build request */
export const SnapshotBuildRequestSchema = z.object({
  base: NonEmptyStringSchema,
  setup: z.string(),
  resources: ResourcesSchema.optional(),
});

export type SnapshotBuildRequest = z.infer<typeof SnapshotBuildRequestSchema>;

/** Snapshot build status */
export const SnapshotBuildStatus = z.enum(['building', 'ready', 'failed']);

export type SnapshotBuildStatus = z.infer<typeof SnapshotBuildStatus>;

/** Snapshot size information */
export const SnapshotSizeSchema = z.object({
  disk: z.string(),
  /** Memory snapshot size (only for VM-based runtimes like Firecracker) */
  memory: z.string().optional(),
  total: z.string(),
});

export type SnapshotSize = z.infer<typeof SnapshotSizeSchema>;

/** Snapshot metadata */
export const SnapshotSchema = z.object({
  id: NonEmptyStringSchema,
  version: z.number().int().positive(),
  createdAt: TimestampSchema,
  size: SnapshotSizeSchema,
  config: ResourcesSchema,
});

export type Snapshot = z.infer<typeof SnapshotSchema>;

/** Snapshot build response */
export const SnapshotBuildResponseSchema = z.object({
  snapshotId: NonEmptyStringSchema,
  status: SnapshotBuildStatus,
  jobId: NonEmptyStringSchema,
});

export type SnapshotBuildResponse = z.infer<typeof SnapshotBuildResponseSchema>;

/** List snapshots response */
export const SnapshotListResponseSchema = z.object({
  snapshots: z.array(SnapshotSchema),
});

export type SnapshotListResponse = z.infer<typeof SnapshotListResponseSchema>;

/** Snapshot build job (for tracking distributed builds) */
export const SnapshotBuildJobSchema = z.object({
  jobId: NonEmptyStringSchema,
  snapshotId: NonEmptyStringSchema,
  status: SnapshotBuildStatus,
  startedAt: TimestampSchema.optional(),
  completedAt: TimestampSchema.optional(),
  error: z.string().optional(),
});

export type SnapshotBuildJob = z.infer<typeof SnapshotBuildJobSchema>;
