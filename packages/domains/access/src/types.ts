import { z } from 'zod';

/** Generic exposed port result (no tunnel-provider coupling) */
export const ExposedPortSchema = z.object({
  /** Port number inside the runtime */
  port: z.number().int().min(1).max(65535),
  /** Public URL to access this port */
  url: z.string().url(),
  /** Human-readable label */
  label: z.string().optional(),
});

export type ExposedPort = z.infer<typeof ExposedPortSchema>;

/**
 * Extended exposed port with access control fields.
 * Used when a tunnel provider (e.g., Pangolin) adds authentication.
 */
export const ExposedPortWithAccessSchema = ExposedPortSchema.extend({
  /** Access control mode used for this port */
  access: z.enum(['sso', 'pin', 'email']).optional(),
  /** Auto-generated PIN (only present when access is 'pin') */
  pin: z.string().optional(),
  /** Time-limited shareable link */
  shareLink: z.string().url().optional(),
});

export type ExposedPortWithAccess = z.infer<typeof ExposedPortWithAccessSchema>;
