import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';

import { deleteDaemon, getDaemons } from '../api/client.js';
import { DaemonForm } from '../components/DaemonForm.js';
import { RelativeTime } from '../components/RelativeTime.js';
import { StatusBadge } from '../components/StatusBadge.js';
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

interface Daemon {
  role: string;
  description: string;
  status: 'active' | 'paused' | 'stopped';
  trigger: { type: string; cron?: string; events?: string[] };
  stats: { totalInvocations: number; lastInvokedAt?: string; avgDurationMs?: number };
  network?: {
    expose?: Array<{ port: number; label?: string }>;
  };
}

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function TriggerBadge({ trigger }: { trigger: Daemon['trigger'] }) {
  const colors: Record<string, string> = {
    webhook: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
    schedule: 'bg-purple-400/10 text-purple-400 border-purple-400/20',
    watch: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    github: 'bg-zinc-400/10 text-zinc-300 border-zinc-400/20',
  };
  const labels: Record<string, string> = {
    webhook: trigger.events?.join(', ') ?? 'webhook',
    schedule: trigger.cron ?? 'schedule',
    watch: 'watch',
    github: 'github',
  };

  return (
    <Badge
      variant="outline"
      className={`rounded ${colors[trigger.type] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}
    >
      {labels[trigger.type] ?? trigger.type}
    </Badge>
  );
}

export function Daemons() {
  const daemons = usePolling(getDaemons, 5000);
  const [formOpen, setFormOpen] = useState(false);
  const [editRole, setEditRole] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function handleCreate() {
    setEditRole(undefined);
    setFormOpen(true);
  }

  function handleEdit(role: string) {
    setEditRole(role);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDaemon(deleteTarget);
      toast.success(`Daemon "${deleteTarget}" deleted`);
      setDeleteTarget(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Daemons</h1>
        <div className="flex items-center gap-3">
          <p className="text-xs text-zinc-500 hidden sm:block">
            Persistent agent roles that respond to triggers
          </p>
          <Button
            size="sm"
            onClick={handleCreate}
            className="bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 hover:bg-emerald-400/20"
          >
            Create Daemon
          </Button>
        </div>
      </div>

      {daemons.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : daemons.error ? (
        <Alert variant="destructive" className="bg-red-400/10 border-red-400/20 text-red-400">
          <AlertDescription>Failed to load daemons: {daemons.error.message}</AlertDescription>
        </Alert>
      ) : daemons.data && daemons.data.daemons.length > 0 ? (
        <div className="space-y-3">
          {(daemons.data.daemons as Daemon[]).map((d) => (
            <Card key={d.role} className="bg-zinc-900 border-zinc-800 py-0 shadow-none">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-zinc-100">{d.role}</h3>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="flex items-center gap-2">
                    <TriggerBadge trigger={d.trigger} />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleEdit(d.role)}
                      className="text-zinc-500 hover:text-zinc-300"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteTarget(d.role)}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                {d.description && <p className="text-xs text-zinc-400 mb-3">{d.description}</p>}
                {d.network?.expose && d.network.expose.length > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs text-zinc-500">Exposed ports:</span>
                    {d.network.expose.map((ep) => (
                      <Badge
                        key={ep.port}
                        variant="outline"
                        className="font-mono rounded bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
                      >
                        :{ep.port}
                        {ep.label ? ` ${ep.label}` : ''}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-6 text-xs">
                  <div>
                    <span className="text-zinc-500">Invocations</span>
                    <p className="text-zinc-300">{d.stats.totalInvocations}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Last run</span>
                    <RelativeTime timestamp={d.stats.lastInvokedAt} className="text-zinc-300" />
                  </div>
                  <div>
                    <span className="text-zinc-500">Avg duration</span>
                    <p className="text-zinc-300">{formatDuration(d.stats.avgDurationMs)}</p>
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
            <p className="text-zinc-500 text-sm">No daemons registered yet.</p>
            <p className="text-zinc-600 text-xs mt-1">
              <Link to="/templates" className="text-emerald-400 hover:text-emerald-300">
                Browse templates
              </Link>{' '}
              or{' '}
              <button
                type="button"
                onClick={handleCreate}
                className="text-emerald-400 hover:text-emerald-300"
              >
                create a daemon
              </button>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit form */}
      <DaemonForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editRole={editRole}
        onSaved={() => {
          // Polling will pick up changes
        }}
      />

      {/* Delete confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Daemon</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete daemon "{deleteTarget}"? This action cannot be undone.
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
