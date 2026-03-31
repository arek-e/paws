import { useState, useEffect, useCallback } from 'react';
import { getCloudConnections, createCloudConnection, deleteCloudConnection, syncCloudConnection, type CloudConnection } from '../api/client.js';

const REGIONS = ['us-east-1','us-east-2','us-west-1','us-west-2','eu-west-1','eu-west-2','eu-west-3','eu-central-1','eu-north-1','ap-southeast-1','ap-southeast-2','ap-northeast-1','ap-northeast-2','ap-south-1','sa-east-1','ca-central-1'];

export function Integrations() {
  const [conns, setConns] = useState<CloudConnection[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => { try { setConns(await getCloudConnections()); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { refresh(); const id = setInterval(refresh, 10000); return () => clearInterval(id); }, [refresh]);

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-100">Integrations</h1>
        {!showForm && <button onClick={() => setShowForm(true)} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors">Connect AWS</button>}
      </div>
      {showForm && <ConnectForm onClose={() => setShowForm(false)} onDone={() => { setShowForm(false); refresh(); }} />}
      {loading ? <p className="text-sm text-zinc-500">Loading...</p>
        : conns.length === 0 && !showForm ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center space-y-4">
            <h2 className="text-sm font-semibold text-zinc-100">No cloud accounts connected</h2>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">Connect your AWS account to discover and manage EC2 instances.</p>
            <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-medium rounded-lg transition-colors">Connect AWS Account</button>
          </div>
        ) : <div className="space-y-3">{conns.map(c => <Card key={c.id} conn={c} onRefresh={refresh} />)}</div>}
    </div>
  );
}

function ConnectForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(''); const [region, setRegion] = useState('us-east-1');
  const [ak, setAk] = useState(''); const [sk, setSk] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ existingInstances: number } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await createCloudConnection({ provider: 'aws-ec2', name: name || 'AWS ' + region, region, accessKeyId: ak, secretAccessKey: sk }); setResult({ existingInstances: r.existingInstances }); setTimeout(onDone, 1500); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  }

  if (result) return (
    <div className="bg-zinc-900 border border-emerald-700 rounded-lg p-6 space-y-3">
      <div className="flex items-center gap-2"><span className="text-emerald-400 text-lg">&#10003;</span><h2 className="text-sm font-semibold text-zinc-100">AWS connected</h2></div>
      <p className="text-xs text-zinc-400">Found <strong className="text-zinc-200">{result.existingInstances}</strong> paws-managed instance{result.existingInstances !== 1 ? 's' : ''}. They will sync within 30s.</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-zinc-100">Connect AWS Account</h2><button type="button" onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button></div>
      <p className="text-xs text-zinc-400">IAM credentials with EC2 access. Encrypted at rest.</p>
      <div className="space-y-3">
        <div><label className="block text-xs text-zinc-500 font-medium mb-1">Name</label><input type="text" value={name} onChange={e => { setName(e.target.value); setErr(''); }} placeholder="e.g. Production AWS" className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-400" /></div>
        <div><label className="block text-xs text-zinc-500 font-medium mb-1">Region</label><select value={region} onChange={e => setRegion(e.target.value)} className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-sm text-zinc-100 focus:outline-none focus:border-emerald-400">{REGIONS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
        <div><label className="block text-xs text-zinc-500 font-medium mb-1">Access Key ID</label><input type="text" value={ak} onChange={e => { setAk(e.target.value); setErr(''); }} placeholder="AKIA..." className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-400 font-mono" required /></div>
        <div><label className="block text-xs text-zinc-500 font-medium mb-1">Secret Access Key</label><input type="password" value={sk} onChange={e => { setSk(e.target.value); setErr(''); }} placeholder="Secret key" className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-400 font-mono" required /></div>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button type="submit" disabled={busy || !ak || !sk} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors">{busy ? 'Validating...' : 'Connect'}</button>
    </form>
  );
}

function Card({ conn, onRefresh }: { conn: CloudConnection; onRefresh: () => void }) {
  const [syncing, setSyncing] = useState(false); const [syncN, setSyncN] = useState<number|null>(null);
  const [deleting, setDeleting] = useState(false); const [err, setErr] = useState('');
  const ok = conn.status === 'connected';

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div><h3 className="text-sm font-medium text-zinc-100">{conn.name}</h3><p className="text-xs text-zinc-500">{conn.provider.toUpperCase()} &middot; {conn.region}</p></div>
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium rounded-full ${ok ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800' : 'bg-red-900/30 text-red-400 border border-red-800'}`}><span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />{ok ? 'Connected' : 'Error'}</span>
      </div>
      {conn.error && <p className="text-xs text-red-400 bg-red-900/10 border border-red-900/30 rounded px-3 py-2">{conn.error}</p>}
      {syncN !== null && <p className="text-xs text-emerald-400">Synced {syncN} instance{syncN !== 1 ? 's' : ''}</p>}
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[10px] text-zinc-600">{conn.lastSyncAt ? 'Last sync: ' + new Date(conn.lastSyncAt).toLocaleString() : 'Never synced'}</p>
        <div className="flex gap-2">
          <button onClick={async () => { setSyncing(true); setErr(''); setSyncN(null); try { const r = await syncCloudConnection(conn.id); setSyncN(r.instances.length); onRefresh(); } catch(e) { setErr(e instanceof Error ? e.message : 'Sync failed'); } finally { setSyncing(false); } }} disabled={syncing} className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors disabled:opacity-50">{syncing ? 'Syncing...' : 'Sync now'}</button>
          <button onClick={async () => { if (!confirm('Disconnect "' + conn.name + '"?')) return; setDeleting(true); try { await deleteCloudConnection(conn.id); onRefresh(); } catch(e) { setErr(e instanceof Error ? e.message : 'Failed'); setDeleting(false); } }} disabled={deleting} className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-red-400 rounded-md transition-colors disabled:opacity-50">{deleting ? '...' : 'Disconnect'}</button>
        </div>
      </div>
    </div>
  );
}
