import { z } from 'zod';

import { NonEmptyStringSchema } from '@paws/domain-common';

/** Worker health status */
export const WorkerStatus = z.enum(['healthy', 'degraded', 'unhealthy']);

export type WorkerStatus = z.infer<typeof WorkerStatus>;

/** Worker capacity info */
export const WorkerCapacitySchema = z.object({
  maxConcurrent: z.number().int().positive(),
  running: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
});

export type WorkerCapacity = z.infer<typeof WorkerCapacitySchema>;

/** Snapshot info on a worker */
export const WorkerSnapshotInfoSchema = z.object({
  id: NonEmptyStringSchema,
  version: z.number().int().positive(),
  ageMs: z.number().int().nonnegative(),
});

export type WorkerSnapshotInfo = z.infer<typeof WorkerSnapshotInfoSchema>;

/** Worker runtime type */
export const WorkerType = z
  .enum(['firecracker', 'container', 'lightweight'])
  .default('firecracker');

export type WorkerType = z.infer<typeof WorkerType>;

/** Worker node info */
export const WorkerSchema = z.object({
  name: NonEmptyStringSchema,
  status: WorkerStatus,
  /** Runtime type this worker supports */
  type: WorkerType,
  capacity: WorkerCapacitySchema,
  /** Snapshot info (optional — not all runtime types use snapshots) */
  snapshot: WorkerSnapshotInfoSchema.optional(),
  uptime: z.number().int().nonnegative(),
});

export type Worker = z.infer<typeof WorkerSchema>;

/** List workers response */
export const WorkerListResponseSchema = z.object({
  workers: z.array(WorkerSchema),
});

export type WorkerListResponse = z.infer<typeof WorkerListResponseSchema>;
