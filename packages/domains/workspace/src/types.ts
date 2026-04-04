import { z } from 'zod';

/** A repository linked to a workspace */
export const WorkspaceRepoSchema = z.object({
  repo: z.string().min(1), // "owner/repo"
  role: z.enum(['primary', 'reference']).default('primary'),
  rootDir: z.string().default('/'),
  branch: z.string().default('main'),
});

export type WorkspaceRepo = z.infer<typeof WorkspaceRepoSchema>;

/** Workspace-level settings for builds and tests */
export const WorkspaceSettingsSchema = z.object({
  language: z.string().optional(),
  packageManager: z.string().optional(),
  testCommand: z.string().optional(),
  buildCommand: z.string().optional(),
});

export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;

/** Full workspace entity */
export const WorkspaceSchema = z.object({
  id: z.string().min(1),
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'Must be lowercase alphanumeric with hyphens'),
  description: z.string().default(''),
  type: z.enum(['monorepo', 'multi-repo']),
  repos: z.array(WorkspaceRepoSchema).min(1),
  settings: WorkspaceSettingsSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

/** Create workspace request body */
export const CreateWorkspaceRequestSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'Must be lowercase alphanumeric with hyphens'),
  description: z.string().optional(),
  type: z.enum(['monorepo', 'multi-repo']),
  repos: z.array(WorkspaceRepoSchema).min(1),
  settings: WorkspaceSettingsSchema.optional(),
});

export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequestSchema>;

/** Update workspace request body (partial) */
export const UpdateWorkspaceRequestSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, 'Must be lowercase alphanumeric with hyphens')
      .optional(),
    description: z.string().optional(),
    type: z.enum(['monorepo', 'multi-repo']).optional(),
    repos: z.array(WorkspaceRepoSchema).min(1).optional(),
    settings: WorkspaceSettingsSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateWorkspaceRequest = z.infer<typeof UpdateWorkspaceRequestSchema>;

/** Workspace list response */
export const WorkspaceListResponseSchema = z.object({
  workspaces: z.array(WorkspaceSchema),
});

export type WorkspaceListResponse = z.infer<typeof WorkspaceListResponseSchema>;
