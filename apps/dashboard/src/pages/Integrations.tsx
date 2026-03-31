import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  getCloudConnections,
  createCloudConnection,
  deleteCloudConnection,
  syncCloudConnection,
  type CloudConnection,
} from '../api/client.js';
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

const REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'eu-north-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-south-1',
  'sa-east-1',
  'ca-central-1',
];

export function Integrations() {
  const [conns, setConns] = useState<CloudConnection[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setConns(await getCloudConnections());
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-100">Integrations</h1>
        {!showForm && (
          <Button
            onClick={() => setShowForm(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            Connect AWS
          </Button>
        )}
      </div>
      {showForm && (
        <ConnectForm
          onClose={() => setShowForm(false)}
          onDone={() => {
            setShowForm(false);
            refresh();
          }}
        />
      )}
      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : conns.length === 0 && !showForm ? (
        <Card className="bg-zinc-900 border-zinc-800 py-0">
          <CardContent className="p-8 text-center space-y-4">
            <h2 className="text-sm font-semibold text-zinc-100">No cloud accounts connected</h2>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Connect your AWS account to discover and manage EC2 instances.
            </p>
            <Button
              variant="outline"
              onClick={() => setShowForm(true)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700"
            >
              Connect AWS Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {conns.map((c) => (
            <ConnectionCard key={c.id} conn={c} onRefresh={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [ak, setAk] = useState('');
  const [sk, setSk] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ existingInstances: number } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await createCloudConnection({
        provider: 'aws-ec2',
        name: name || 'AWS ' + region,
        region,
        accessKeyId: ak,
        secretAccessKey: sk,
      });
      toast.success('AWS connected');
      setResult({ existingInstances: r.existingInstances });
      setTimeout(onDone, 1500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  if (result)
    return (
      <Card className="bg-zinc-900 border-emerald-700 gap-0 py-0">
        <CardContent className="p-6 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 text-lg">&#10003;</span>
            <h2 className="text-sm font-semibold text-zinc-100">AWS connected</h2>
          </div>
          <p className="text-xs text-zinc-400">
            Found <strong className="text-zinc-200">{result.existingInstances}</strong> paws-managed
            instance{result.existingInstances !== 1 ? 's' : ''}. They will sync within 30s.
          </p>
        </CardContent>
      </Card>
    );

  return (
    <form onSubmit={submit}>
      <Card className="bg-zinc-900 border-zinc-800 gap-0 py-0">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-100">Connect AWS Account</h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-300"
            >
              Cancel
            </Button>
          </div>
          <p className="text-xs text-zinc-400">
            IAM credentials with EC2 access. Encrypted at rest.
          </p>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-zinc-500 font-medium mb-1">Name</Label>
              <Input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErr('');
                }}
                placeholder="e.g. Production AWS"
                className="bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/20"
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-500 font-medium mb-1">Region</Label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-sm text-zinc-100 focus:outline-none focus:border-emerald-400"
              >
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs text-zinc-500 font-medium mb-1">Access Key ID</Label>
              <Input
                type="text"
                value={ak}
                onChange={(e) => {
                  setAk(e.target.value);
                  setErr('');
                }}
                placeholder="AKIA..."
                className="bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/20 font-mono"
                required
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-500 font-medium mb-1">Secret Access Key</Label>
              <Input
                type="password"
                value={sk}
                onChange={(e) => {
                  setSk(e.target.value);
                  setErr('');
                }}
                placeholder="Secret key"
                className="bg-zinc-950 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/20 font-mono"
                required
              />
            </div>
          </div>
          {err && (
            <Alert variant="destructive" className="bg-transparent border-0 p-0">
              <AlertDescription className="text-xs text-red-400">{err}</AlertDescription>
            </Alert>
          )}
          <Button
            type="submit"
            disabled={busy || !ak || !sk}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {busy ? 'Validating...' : 'Connect'}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}

function ConnectionCard({ conn, onRefresh }: { conn: CloudConnection; onRefresh: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [syncN, setSyncN] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [err, setErr] = useState('');
  const ok = conn.status === 'connected';

  async function doDisconnect() {
    setDeleting(true);
    try {
      await deleteCloudConnection(conn.id);
      onRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
      setDeleting(false);
    }
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800 gap-0 py-0">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-zinc-100">{conn.name}</h3>
            <p className="text-xs text-zinc-500">
              {conn.provider.toUpperCase()} &middot; {conn.region}
            </p>
          </div>
          <Badge
            className={`gap-1.5 rounded-full text-[10px] font-medium ${ok ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800' : 'bg-red-900/30 text-red-400 border border-red-800'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {ok ? 'Connected' : 'Error'}
          </Badge>
        </div>
        {conn.error && (
          <Alert variant="destructive" className="bg-red-900/10 border-red-900/30 px-3 py-2">
            <AlertDescription className="text-xs text-red-400">{conn.error}</AlertDescription>
          </Alert>
        )}
        {syncN !== null && (
          <p className="text-xs text-emerald-400">
            Synced {syncN} instance{syncN !== 1 ? 's' : ''}
          </p>
        )}
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex items-center justify-between pt-1">
          <p className="text-[10px] text-zinc-600">
            {conn.lastSyncAt
              ? 'Last sync: ' + new Date(conn.lastSyncAt).toLocaleString()
              : 'Never synced'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setSyncing(true);
                setErr('');
                setSyncN(null);
                try {
                  const r = await syncCloudConnection(conn.id);
                  setSyncN(r.instances.length);
                  toast.success(
                    `Synced ${r.instances.length} instance${r.instances.length !== 1 ? 's' : ''}`,
                  );
                  onRefresh();
                } catch (e) {
                  setErr(e instanceof Error ? e.message : 'Sync failed');
                } finally {
                  setSyncing(false);
                }
              }}
              disabled={syncing}
              className="bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300"
            >
              {syncing ? 'Syncing...' : 'Sync now'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={deleting}
              className="bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-red-400"
            >
              {deleting ? '...' : 'Disconnect'}
            </Button>
          </div>
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Disconnect Integration</DialogTitle>
              <DialogDescription>Disconnect "{conn.name}"?</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirmOpen(false);
                  doDisconnect();
                }}
              >
                Disconnect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
