import { useState } from 'react';

import {
  addServer,
  deleteServer,
  getServers,
  validateServer,
  type ServerInfo,
  type ValidationCheck,
} from '../api/client.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { usePolling } from '../hooks/usePolling.js';

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

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

  async function handleValidate() {
    setValidating(true);
    try {
      const result = await validateServer(server.id);
      setChecks(result.checks);
    } catch {
      setChecks([
        { label: 'Validation failed', status: 'fail', message: 'Could not reach server' },
      ]);
    } finally {
      setValidating(false);
    }
    onValidate();
  }

  async function handleRemove() {
    if (!confirm(`Remove server "${server.name}" (${server.ip})?`)) return;
    setRemoving(true);
    try {
      await deleteServer(server.id);
      onRemove();
    } catch {
      setRemoving(false);
    }
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
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
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs border bg-zinc-800 text-zinc-400 border-zinc-700">
          {server.provider}
        </span>
      </div>

      <div className="flex gap-6 text-xs mb-3">
        <div>
          <span className="text-zinc-500">IP</span>
          <p className="text-zinc-300 font-mono">{server.ip || '-'}</p>
        </div>
        <div>
          <span className="text-zinc-500">Added</span>
          <p className="text-zinc-300">{formatTimeAgo(server.createdAt)}</p>
        </div>
        <div>
          <span className="text-zinc-500">Status</span>
          <p className="text-zinc-300">{server.status}</p>
        </div>
      </div>

      {server.error && (
        <div className="bg-red-400/10 border border-red-400/20 rounded p-2 text-red-400 text-xs mb-3">
          {server.error}
        </div>
      )}

      {checks && <ValidationChecklist checks={checks} />}

      <div className="flex gap-2 mt-3">
        <button
          onClick={handleValidate}
          disabled={validating}
          className="px-3 py-1.5 text-xs font-medium rounded bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 hover:bg-emerald-400/20 transition-colors disabled:opacity-50"
        >
          {validating ? 'Validating...' : 'Validate'}
        </button>
        <button
          onClick={handleRemove}
          disabled={removing}
          className="px-3 py-1.5 text-xs font-medium rounded bg-red-400/10 text-red-400 border border-red-400/20 hover:bg-red-400/20 transition-colors disabled:opacity-50"
        >
          {removing ? 'Removing...' : 'Remove'}
        </button>
      </div>
    </div>
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
      setName('');
      setIp('');
      setPassword('');
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-zinc-100 mb-3">Add Server (BYO)</h3>
      <p className="text-xs text-zinc-500 mb-4">
        Provide SSH access to a bare metal server with /dev/kvm support.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="worker-1"
            required
            className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-400/50"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">IP Address</label>
          <input
            type="text"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="65.108.10.170"
            required
            className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-400/50"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Root Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            required
            className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-400/50"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-400/10 border border-red-400/20 rounded p-2 text-red-400 text-xs mb-3">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={adding || !name || !ip || !password}
        className="px-4 py-2 text-sm font-medium rounded bg-emerald-500 text-zinc-950 hover:bg-emerald-400 transition-colors disabled:opacity-50"
      >
        {adding ? 'Adding...' : 'Add Server'}
      </button>
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
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 text-xs font-medium rounded bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 hover:bg-emerald-400/20 transition-colors"
        >
          {showForm ? 'Cancel' : 'Add Server'}
        </button>
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
            <div
              key={i}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 h-32 animate-pulse"
            />
          ))}
        </div>
      ) : servers.error ? (
        <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4 text-red-400 text-sm">
          Failed to load servers: {servers.error.message}
        </div>
      ) : servers.data && servers.data.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {servers.data.map((s) => (
            <ServerCard key={s.id} server={s} onRemove={() => {}} onValidate={() => {}} />
          ))}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
          <pre className="text-zinc-600 text-xs font-mono mb-2">{`   /\\_/\\
  ( o.o )
   > ^ <`}</pre>
          <p className="text-zinc-500 text-sm">No servers registered yet.</p>
          <p className="text-zinc-600 text-xs mt-1">
            Click <strong className="text-zinc-500">Add Server</strong> to connect a bare metal
            worker node
          </p>
        </div>
      )}
    </div>
  );
}
