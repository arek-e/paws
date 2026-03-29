import { z } from 'zod';

import { NonEmptyStringSchema } from './common.js';
import { ResourcesSchema } from './session.js';

/** Available snapshot templates */
export const SnapshotTemplateId = z.enum([
  'minimal',
  'node',
  'python',
  'docker',
  'fullstack',
  'claude-code',
]);

export type SnapshotTemplateId = z.infer<typeof SnapshotTemplateId>;

/** Snapshot configuration — defines how to build a VM snapshot */
export const SnapshotConfigSchema = z.object({
  /** Unique snapshot identifier */
  id: NonEmptyStringSchema,
  /** Base template (optional — can be fully custom) */
  template: SnapshotTemplateId.optional(),
  /** VM resources for the build */
  resources: ResourcesSchema.optional(),
  /** Setup script (bash) — generated from template or custom */
  setup: z.string(),
  /** Domains the snapshot needs (e.g., Docker registries) — auto-merged into allowOut */
  requiredDomains: z.array(z.string()).default([]),
});

export type SnapshotConfig = z.infer<typeof SnapshotConfigSchema>;

/** Create snapshot config request */
export const CreateSnapshotConfigRequestSchema = SnapshotConfigSchema;

export type CreateSnapshotConfigRequest = z.infer<typeof CreateSnapshotConfigRequestSchema>;

/** Snapshot config list response */
export const SnapshotConfigListResponseSchema = z.object({
  configs: z.array(SnapshotConfigSchema),
});

export type SnapshotConfigListResponse = z.infer<typeof SnapshotConfigListResponseSchema>;
