import { useState } from 'react';
import { toast } from 'sonner';

import {
  addServer,
  deleteServer,
  getServers,
  validateServer,
  type ServerInfo,
  type ValidationCheck,
} from '../api/client.js';
import { Copyable } from '../components/CopyButton.js';
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
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { usePolling } from '../hooks/usePolling.js';

function CheckIcon({ status }: { status: ValidationCheck['status'] }) {
  if (status === 'pass') {
    return (
      <svg
        className="w-4 h-4 text-emerald-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (status === 'fail') {
    return (
      <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    );
  }
  return (
    <svg
      className="w-4 h-4 text-zinc-500 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function ValidationChecklist({ checks }: { checks: ValidationCheck[] }) {
  return (
    <div className="mt-3 space-y-1.5">
      {checks.map((check) => (
        <div key={check.label} className="flex items-center gap-2">
          <CheckIcon status={check.status} />
          <span className="text-xs text-zinc-300">{check.label}</span>
          {check.message && <span className="text-xs text-zinc-500">-- {check.message}</span>}
        </div>
      ))}
    </div>
  );
}

function ServerCard({
  server,
  onRemove,
  onValidate,
}: {
  server: ServerInfo;
  onRemove: () => void;
  onValidate: () => void;
}) {
  const [checks, setChecks] = useState<ValidationCheck[] | null>(null);
  const [validating, setValidating] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleValidate() {
    setValidating(true);
    try {
      const result = await validateServer(server.id);
      setChecks(result.checks);
      const allPassed = result.checks.every((c: ValidationCheck) => c.status === 'pass');
      if (allPassed) {
        toast.success(`Server "${server.name}" validation passed`);
      } else {
        toast.error(`Server "${server.name}" has validation failures`);
      }
    } catch {
      setChecks([
        { label: 'Validation failed', status: 'fail', message: 'Could not reach server' },
      ]);
      toast.error(`Could not reach server "${server.name}"`);
    } finally {
      setValidating(false);
    }
    onValidate();
  }

  async function doRemove() {
    setRemoving(true);
    try {
      await deleteServer(server.id);
      onRemove();
    } catch {
      setRemoving(false);
    }
  }

  function handleRemove() {
    setConfirmOpen(true);
  }

  const statusMap: Record<string, string> = {
    ready: 'healthy',
    error: 'failed',
    provisioning: 'pending',
    waiting_ssh: 'pending',
    bootstrapping: 'running',
    registering: 'running',
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800 gap-0 py-0">
      <CardContent className="p-4 space-y-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-zinc-100">{server.name}</h3>
            <StatusBadge
              status={
                (statusMap[server.status] ?? server.status) as
                  | 'healthy'
                  | 'failed'
                  | 'pending'
                  | 'running'
              }
            />
          </div>
          <Badge variant="outline" className="bg-zinc-800 text-zinc-400 border-zinc-700">
            {server.provider}
          </Badge>
        </div>

        <div className="flex gap-6 text-xs mb-3">
          <div>
            <span className="text-zinc-500">IP</span>
            {server.ip ? (
              <Copyable value={server.ip}>
                <span className="text-zinc-300 font-mono">{server.ip}</span>
              </Copyable>
            ) : (
              <p className="text-zinc-300 font-mono">-</p>
            )}
          </div>
          <div>
            <span className="text-zinc-500">Added</span>
            <RelativeTime timestamp={server.createdAt} className="text-zinc-300" />
          </div>
          <div>
            <span className="text-zinc-500">Status</span>
            <p className="text-zinc-300">{server.status}</p>
          </div>
        </div>

        {server.error && (
          <Alert variant="destructive" className="bg-red-400/10 border-red-400/20 mb-3 p-2">
            <AlertDescription className="text-red-400 text-xs">{server.error}</AlertDescription>
          </Alert>
        )}

        {checks && <ValidationChecklist checks={checks} />}

        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            onClick={handleValidate}
            disabled={validating}
            className="bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 hover:bg-emerald-400/20"
          >
            {validating ? 'Validating...' : 'Validate'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleRemove}
            disabled={removing}
            className="bg-red-400/10 text-red-400 border border-red-400/20 hover:bg-red-400/20 hover:text-red-400"
          >
            {removing ? 'Removing...' : 'Remove'}
          </Button>
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Server</DialogTitle>
              <DialogDescription>
                Remove server "{server.name}" ({server.ip})?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirmOpen(false);
                  doRemove();
                }}
              >
                Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function AddServerForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [password, setPassword] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await addServer({ provider: 'manual', name, ip, password });
      toast.success('Server added');
      setName('');
      setIp('');
      setPassword('');
      onAdded();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
      setError(message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="bg-zinc-900 border-zinc-800 gap-0 py-0">
        <CardContent className="p-4 space-y-0">
          <h3 className="text-sm font-semibold text-zinc-100 mb-3">Add Server (BYO)</h3>
          <p className="text-xs text-zinc-500 mb-4">
            Provide SSH access to a bare metal server with /dev/kvm support.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <Label className="text-xs text-zinc-400 mb-1">Name</Label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="worker-1"
                required
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1">IP Address</Label>
              <Input
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="65.108.10.170"
                required
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1">Root Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password"
                required
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-400/50 focus-visible:ring-emerald-400/20"
              />
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="bg-red-400/10 border-red-400/20 mb-3 p-2">
              <AlertDescription className="text-red-400 text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            disabled={adding || !name || !ip || !password}
            className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
          >
            {adding ? 'Adding...' : 'Add Server'}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}

export function Servers() {
  const servers = usePolling(getServers, 5000);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Servers</h1>
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 hover:bg-emerald-400/20"
        >
          {showForm ? 'Cancel' : 'Add Server'}
        </Button>
      </div>

      {showForm && (
        <AddServerForm
          onAdded={() => {
            setShowForm(false);
          }}
        />
      )}

      {servers.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-32 bg-zinc-800 rounded-lg" />
          ))}
        </div>
      ) : servers.error ? (
        <Alert variant="destructive" className="bg-red-400/10 border-red-400/20">
          <AlertDescription className="text-red-400 text-sm">
            Failed to load servers: {servers.error.message}
          </AlertDescription>
        </Alert>
      ) : servers.data && servers.data.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {servers.data.map((s) => (
            <ServerCard key={s.id} server={s} onRemove={() => {}} onValidate={() => {}} />
          ))}
        </div>
      ) : (
        <Card className="bg-zinc-900 border-zinc-800 py-0">
          <CardContent className="p-8 text-center">
            <pre className="text-zinc-600 text-xs font-mono mb-2">{`   /\\_/\\
  ( o.o )
   > ^ <`}</pre>
            <p className="text-zinc-500 text-sm">No servers registered yet.</p>
            <p className="text-zinc-600 text-xs mt-1">
              Click <strong className="text-zinc-500">Add Server</strong> to connect a bare metal
              worker node
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
