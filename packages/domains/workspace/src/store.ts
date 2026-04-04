import type { CreateWorkspaceRequest, Workspace } from './types.js';

export interface WorkspaceStore {
  create(workspace: Workspace): Workspace;
  get(id: string): Workspace | undefined;
  getByName(name: string): Workspace | undefined;
  list(): Workspace[];
  update(id: string, partial: Partial<CreateWorkspaceRequest>): Workspace | undefined;
  delete(id: string): boolean;
}

/** In-memory workspace store */
export function createWorkspaceStore(): WorkspaceStore {
  const workspaces = new Map<string, Workspace>();

  return {
    create(workspace) {
      workspaces.set(workspace.id, workspace);
      return workspace;
    },

    get(id) {
      return workspaces.get(id);
    },

    getByName(name) {
      for (const workspace of workspaces.values()) {
        if (workspace.name === name) return workspace;
      }
      return undefined;
    },

    list() {
      return [...workspaces.values()];
    },

    update(id, partial) {
      const workspace = workspaces.get(id);
      if (!workspace) return undefined;
      const updated: Workspace = {
        ...workspace,
        ...(partial.name !== undefined && { name: partial.name }),
        ...(partial.description !== undefined && { description: partial.description }),
        ...(partial.type !== undefined && { type: partial.type }),
        ...(partial.repos !== undefined && { repos: partial.repos }),
        ...(partial.settings !== undefined && { settings: partial.settings }),
        updatedAt: new Date().toISOString(),
      };
      workspaces.set(id, updated);
      return updated;
    },

    delete(id) {
      return workspaces.delete(id);
    },
  };
}
