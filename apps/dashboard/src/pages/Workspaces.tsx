import { useState } from 'react';
import { toast } from 'sonner';
import { FolderGit2, GitBranch, Pencil, Trash2 } from 'lucide-react';

import { deleteWorkspace, listWorkspaces } from '../api/client.js';
import { WorkspaceForm } from '../components/WorkspaceForm.js';
import { RelativeTime } from '../components/RelativeTime.js';
import { Alert, AlertDescription } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent } from '../components/ui/card.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { usePolling } from '../hooks/usePolling.js';

interface Workspace {
  id: string;
  name: string;
  description?: string;
  type: 'monorepo' | 'multi-repo';
  repos: Array<{ name: string; role?: string; branch?: string }>;
  daemonCount?: number;
  createdAt: string;
}

function TypeBadge({ type }: { type: Workspace['type'] }) {
  const styles =
    type === 'monorepo'
      ? 'bg-blue-400/10 text-blue-400 border-blue-400/20'
      : 'bg-purple-400/10 text-purple-400 border-purple-400/20';

  return (
    <Badge variant="outline" className={`rounded ${styles}`}>
      {type}
    </Badge>
  );
}

export function Workspaces() {
  const workspaces = usePolling(listWorkspaces, 5000);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState(false);

  function handleCreate() {
    setEditId(undefined);
    setFormOpen(true);
  }

  function handleEdit(id: string) {
    setEditId(id);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteWorkspace(deleteTarget.id);
      toast.success(`Workspace "${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  }

  const items = workspaces.data?.workspaces ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Workspaces</h1>
        <div className="flex items-center gap-3">
          <p className="text-xs text-zinc-500 hidden sm:block">
            Group repositories and configure project settings
          </p>
          <Button
            size="sm"
            onClick={handleCreate}
            className="bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 hover:bg-emerald-400/20"
          >
            New Workspace
          </Button>
        </div>
      </div>

      {workspaces.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : workspaces.error ? (
        <Alert variant="destructive" className="bg-red-400/10 border-red-400/20 text-red-400">
          <AlertDescription>Failed to load workspaces: {workspaces.error.message}</AlertDescription>
        </Alert>
      ) : items.length > 0 ? (
        <div className="space-y-3">
          {items.map((ws) => (
            <Card key={ws.id} className="bg-zinc-900 border-zinc-800 py-0 shadow-none">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <FolderGit2 className="size-4 text-zinc-500" />
                    <h3 className="text-sm font-semibold text-zinc-100">{ws.name}</h3>
                    <TypeBadge type={ws.type} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleEdit(ws.id)}
                      className="text-zinc-500 hover:text-zinc-300"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteTarget(ws)}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                {ws.description && <p className="text-xs text-zinc-400 mb-3">{ws.description}</p>}

                {/* Repo list */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {ws.repos.map((repo) => (
                    <Badge
                      key={repo.name}
                      variant="outline"
                      className="gap-1 font-mono rounded bg-zinc-800 text-zinc-300 border-zinc-700"
                    >
                      <GitBranch className="size-3" />
                      {repo.name}
                      {repo.branch && repo.branch !== 'main' && (
                        <span className="text-zinc-500">:{repo.branch}</span>
                      )}
                    </Badge>
                  ))}
                </div>

                <div className="flex gap-6 text-xs">
                  <div>
                    <span className="text-zinc-500">Daemons</span>
                    <p className="text-zinc-300">{ws.daemonCount ?? 0}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Created</span>
                    <RelativeTime timestamp={ws.createdAt} className="text-zinc-300" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-zinc-900 border-zinc-800 py-0 shadow-none">
          <CardContent className="p-8 text-center">
            <pre className="text-zinc-600 text-xs font-mono mb-2">{`   /\\_/\\
  ( o.o )
   > ^ <`}</pre>
            <p className="text-zinc-500 text-sm">No workspaces configured yet.</p>
            <p className="text-zinc-600 text-xs mt-1">
              <button
                type="button"
                onClick={handleCreate}
                className="text-emerald-400 hover:text-emerald-300"
              >
                Create a workspace
              </button>{' '}
              to group your repositories.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit form */}
      <WorkspaceForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editId={editId}
        onSaved={() => {
          // Polling will pick up changes
        }}
      />

      {/* Delete confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workspace</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete workspace "{deleteTarget?.name}"? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
