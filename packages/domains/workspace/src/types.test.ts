import { describe, expect, test } from 'vitest';

import {
  CreateWorkspaceRequestSchema,
  UpdateWorkspaceRequestSchema,
  WorkspaceRepoSchema,
  WorkspaceSchema,
  WorkspaceSettingsSchema,
} from './types.js';

describe('WorkspaceRepoSchema', () => {
  test('accepts valid repo with defaults', () => {
    const result = WorkspaceRepoSchema.parse({ repo: 'org/repo' });
    expect(result.repo).toBe('org/repo');
    expect(result.role).toBe('primary');
    expect(result.rootDir).toBe('/');
    expect(result.branch).toBe('main');
  });

  test('accepts repo with overrides', () => {
    const result = WorkspaceRepoSchema.parse({
      repo: 'org/repo',
      role: 'reference',
      rootDir: '/packages/lib',
      branch: 'develop',
    });
    expect(result.role).toBe('reference');
    expect(result.rootDir).toBe('/packages/lib');
    expect(result.branch).toBe('develop');
  });

  test('rejects empty repo string', () => {
    const result = WorkspaceRepoSchema.safeParse({ repo: '' });
    expect(result.success).toBe(false);
  });

  test('rejects invalid role', () => {
    const result = WorkspaceRepoSchema.safeParse({ repo: 'org/repo', role: 'invalid' });
    expect(result.success).toBe(false);
  });
});

describe('WorkspaceSettingsSchema', () => {
  test('accepts empty object', () => {
    const result = WorkspaceSettingsSchema.parse({});
    expect(result).toEqual({});
  });

  test('accepts all optional fields', () => {
    const result = WorkspaceSettingsSchema.parse({
      language: 'typescript',
      packageManager: 'bun',
      testCommand: 'bun test',
      buildCommand: 'bun run build',
    });
    expect(result.language).toBe('typescript');
    expect(result.packageManager).toBe('bun');
  });
});

describe('WorkspaceSchema', () => {
  const validWorkspace = {
    id: 'ws-1',
    name: 'my-project',
    type: 'monorepo' as const,
    repos: [{ repo: 'org/repo' }],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  test('accepts valid workspace with defaults', () => {
    const result = WorkspaceSchema.parse(validWorkspace);
    expect(result.id).toBe('ws-1');
    expect(result.name).toBe('my-project');
    expect(result.description).toBe('');
    expect(result.settings).toEqual({});
  });

  test('rejects name with uppercase', () => {
    const result = WorkspaceSchema.safeParse({ ...validWorkspace, name: 'MyProject' });
    expect(result.success).toBe(false);
  });

  test('rejects name with spaces', () => {
    const result = WorkspaceSchema.safeParse({ ...validWorkspace, name: 'my project' });
    expect(result.success).toBe(false);
  });

  test('rejects name with underscores', () => {
    const result = WorkspaceSchema.safeParse({ ...validWorkspace, name: 'my_project' });
    expect(result.success).toBe(false);
  });

  test('accepts name with hyphens and numbers', () => {
    const result = WorkspaceSchema.parse({ ...validWorkspace, name: 'my-project-123' });
    expect(result.name).toBe('my-project-123');
  });

  test('rejects empty repos array', () => {
    const result = WorkspaceSchema.safeParse({ ...validWorkspace, repos: [] });
    expect(result.success).toBe(false);
  });

  test('rejects empty id', () => {
    const result = WorkspaceSchema.safeParse({ ...validWorkspace, id: '' });
    expect(result.success).toBe(false);
  });

  test('accepts multi-repo type', () => {
    const result = WorkspaceSchema.parse({ ...validWorkspace, type: 'multi-repo' });
    expect(result.type).toBe('multi-repo');
  });
});

describe('CreateWorkspaceRequestSchema', () => {
  test('accepts valid create request', () => {
    const result = CreateWorkspaceRequestSchema.parse({
      name: 'my-workspace',
      type: 'monorepo',
      repos: [{ repo: 'org/repo' }],
    });
    expect(result.name).toBe('my-workspace');
    expect(result.type).toBe('monorepo');
  });

  test('accepts optional description and settings', () => {
    const result = CreateWorkspaceRequestSchema.parse({
      name: 'my-workspace',
      description: 'A test workspace',
      type: 'multi-repo',
      repos: [{ repo: 'org/repo' }],
      settings: { language: 'typescript' },
    });
    expect(result.description).toBe('A test workspace');
    expect(result.settings?.language).toBe('typescript');
  });

  test('rejects missing name', () => {
    const result = CreateWorkspaceRequestSchema.safeParse({
      type: 'monorepo',
      repos: [{ repo: 'org/repo' }],
    });
    expect(result.success).toBe(false);
  });

  test('rejects missing repos', () => {
    const result = CreateWorkspaceRequestSchema.safeParse({
      name: 'test',
      type: 'monorepo',
    });
    expect(result.success).toBe(false);
  });
});

describe('UpdateWorkspaceRequestSchema', () => {
  test('accepts partial update with name only', () => {
    const result = UpdateWorkspaceRequestSchema.parse({ name: 'new-name' });
    expect(result.name).toBe('new-name');
  });

  test('accepts partial update with repos only', () => {
    const result = UpdateWorkspaceRequestSchema.parse({
      repos: [{ repo: 'org/new-repo' }],
    });
    expect(result.repos).toHaveLength(1);
  });

  test('rejects empty object', () => {
    const result = UpdateWorkspaceRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
