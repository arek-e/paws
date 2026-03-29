import { z } from 'zod';

/** Pangolin tunnel connectivity status */
export const PangolinStatusSchema = z
  .object({
    connected: z.boolean(),
    tunnelWorkers: z.number().int().nonnegative(),
    lastPollAt: z.string().nullable(),
  })
  .optional();

/** Fleet overview stats */
export const FleetOverviewSchema = z.object({
  totalWorkers: z.number().int().nonnegative(),
  healthyWorkers: z.number().int().nonnegative(),
  totalCapacity: z.number().int().nonnegative(),
  usedCapacity: z.number().int().nonnegative(),
  queuedSessions: z.number().int().nonnegative(),
  activeDaemons: z.number().int().nonnegative(),
  activeSessions: z.number().int().nonnegative(),
  pangolin: PangolinStatusSchema,
});

export type FleetOverview = z.infer<typeof FleetOverviewSchema>;

/** Per-daemon cost breakdown */
export const DaemonCostSchema = z.object({
  role: z.string(),
  totalInvocations: z.number().int().nonnegative(),
  totalVcpuSeconds: z.number().nonnegative(),
  totalDurationMs: z.number().nonnegative(),
});

export type DaemonCost = z.infer<typeof DaemonCostSchema>;

/** Fleet-wide cost summary */
export const CostSummarySchema = z.object({
  totalVcpuSeconds: z.number().nonnegative(),
  totalSessions: z.number().int().nonnegative(),
  byDaemon: z.array(DaemonCostSchema),
});

export type CostSummary = z.infer<typeof CostSummarySchema>;
