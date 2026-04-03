import { z } from 'zod';

/** Governance policy — rate limits, approval gates, audit configuration */
export const GovernanceSchema = z.object({
  maxActionsPerHour: z.number().int().positive().optional(),
  requiresApproval: z.array(z.string()).default([]),
  auditLog: z.boolean().default(true),
});

export type Governance = z.infer<typeof GovernanceSchema>;
