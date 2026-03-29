import { useState } from 'react';

import {
  getPangolinResources,
  getPangolinSites,
  getPangolinUsers,
  getPangolinIdps,
  getPangolinStatus,
  deletePangolinResource,
  invitePangolinUser,
  removePangolinUser,
  createPangolinOidcIdp,
  deletePangolinIdp,
  type PangolinResource,
  type PangolinSite,
  type PangolinUser,
  type PangolinIdp,
} from '../api/client.js';
import { usePolling } from '../hooks/usePolling.js';

type Tab = 'tunnels' | 'sites' | 'users' | 'sso';

export function Tunnels() {
  const [tab, setTab] = useState<Tab>('tunnels');
  const status = usePolling(getPangolinStatus, 10000);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Tunnels</h1>
          {status.data && (
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-full border ${
                status.data.reachable
                  ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20'
                  : 'bg-red-400/10 text-red-400 border-red-400/20'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${status.data.reachable ? 'bg-emerald-400' : 'bg-red-400'}`}
              />
              {status.data.reachable ? 'Pangolin connected' : 'Pangolin unreachable'}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-zinc-800">
        {(['tunnels', 'sites', 'users', 'sso'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize transition-colors ${
              tab === t
                ? 'text-emerald-400 border-b-2 border-emerald-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t === 'sso' ? 'SSO' : t}
          </button>
        ))}
      </div>

      {tab === 'tunnels' && <TunnelsTab />}
      {tab === 'sites' && <SitesTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'sso' && <SsoTab />}
    </div>
  );
}

function TunnelsTab() {
  const resources = usePolling(getPangolinResources, 5000);

  async function handleDelete(id: string | number) {
    await deletePangolinResource(id);
  }

  if (resources.loading && !resources.data) {
    return <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 animate-pulse h-32" />;
  }
  if (resources.error) {
    return (
      <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4 text-red-400 text-sm">
        {resources.error.message}
      </div>
    );
  }

  const items = resources.data ?? [];
  if (items.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
        <p className="text-zinc-500 text-sm">
          No active tunnels. Exposed ports appear here when sessions with{' '}
          <code className="text-zinc-400">network.expose</code> are running.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((r: PangolinResource) => (
        <div
          key={r.resourceId}
          className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 text-xs font-mono rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
              {r.fullDomain ?? r.subdomain ?? r.name}
            </span>
            <span className="text-xs text-zinc-500">{r.protocol}</span>
            {r.http && (
              <a
                href={`https://${r.fullDomain ?? r.subdomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
              >
                open
              </a>
            )}
          </div>
          <button
            onClick={() => handleDelete(r.resourceId)}
            className="px-2 py-1 text-xs text-red-400 hover:bg-red-400/10 rounded transition-colors"
          >
            delete
          </button>
        </div>
      ))}
    </div>
  );
}

function SitesTab() {
  const sites = usePolling(getPangolinSites, 5000);

  if (sites.loading && !sites.data) {
    return <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 animate-pulse h-32" />;
  }

  const items = sites.data ?? [];
  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
          <p className="text-zinc-500 text-sm">No sites registered. Workers connect via Newt.</p>
        </div>
      ) : (
        items.map((s: PangolinSite) => (
          <div
            key={s.siteId}
            className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-100">{s.name}</span>
              <span
                className={`px-2 py-0.5 text-xs rounded-full border ${
                  s.online
                    ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20'
                    : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                }`}
              >
                {s.online ? 'online' : 'offline'}
              </span>
              <span className="text-xs text-zinc-600">{s.type}</span>
            </div>
            <span className="text-xs text-zinc-600 font-mono">{s.siteId}</span>
          </div>
        ))
      )}
    </div>
  );
}

function UsersTab() {
  const users = usePolling(getPangolinUsers, 10000);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await invitePangolinUser(inviteEmail.trim());
      setInviteEmail('');
    } catch (err) {
      console.error('Failed to invite user:', err);
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(userId: string) {
    await removePangolinUser(userId);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder="email@example.com"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
          onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
        />
        <button
          onClick={handleInvite}
          disabled={inviting || !inviteEmail.trim()}
          className="px-4 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded transition-colors"
        >
          {inviting ? 'Inviting...' : 'Invite'}
        </button>
      </div>

      <div className="space-y-2">
        {(users.data ?? []).map((u: PangolinUser) => (
          <div
            key={u.userId}
            className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-100">{u.email}</span>
              {u.name && <span className="text-xs text-zinc-500">{u.name}</span>}
              {u.role && (
                <span className="px-1.5 py-0.5 text-xs rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                  {u.role}
                </span>
              )}
            </div>
            <button
              onClick={() => handleRemove(u.userId)}
              className="px-2 py-1 text-xs text-red-400 hover:bg-red-400/10 rounded transition-colors"
            >
              remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SsoTab() {
  const idps = usePolling(getPangolinIdps, 10000);
  const [showSetup, setShowSetup] = useState(false);
  const [setting, setSetting] = useState(false);

  async function handleAutoSetup() {
    setSetting(true);
    try {
      // Auto-configure Dex as the OIDC provider
      const domain = window.location.hostname.replace(/^fleet\./, '');
      await createPangolinOidcIdp({
        name: 'paws (Dex)',
        clientId: 'pangolin',
        clientSecret: '', // User must provide this
        authUrl: `https://fleet.${domain}/dex/auth`,
        tokenUrl: `https://fleet.${domain}/dex/token`,
      });
      setShowSetup(false);
    } catch (err) {
      console.error('Failed to create IdP:', err);
    } finally {
      setSetting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          Identity providers for exposed port authentication. Users log in once to access all tunnel
          URLs.
        </p>
        <button
          onClick={() => setShowSetup(!showSetup)}
          className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors"
        >
          {showSetup ? 'Cancel' : 'Add Dex SSO'}
        </button>
      </div>

      {showSetup && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <p className="text-sm text-zinc-300">
            This will register Dex (your existing OIDC provider) as a Pangolin identity provider.
            Users who can log into the paws dashboard will also be able to access exposed tunnel
            URLs.
          </p>
          <p className="text-xs text-zinc-500">
            Make sure the <code className="text-zinc-400">PANGOLIN_OIDC_SECRET</code> env var is set
            and matches the Dex client secret. The setup script generates this automatically.
          </p>
          <button
            onClick={handleAutoSetup}
            disabled={setting}
            className="px-4 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-md transition-colors"
          >
            {setting ? 'Configuring...' : 'Configure Dex SSO'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {(idps.data ?? []).length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
            <p className="text-zinc-500 text-sm">
              No identity providers configured. Add Dex SSO so tunnel URLs use the same login as the
              dashboard.
            </p>
          </div>
        ) : (
          (idps.data ?? []).map((idp: PangolinIdp) => (
            <div
              key={idp.idpId}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-100">{idp.name}</span>
                <span className="px-1.5 py-0.5 text-xs rounded bg-blue-400/10 text-blue-400 border border-blue-400/20">
                  {idp.type}
                </span>
              </div>
              <button
                onClick={() => deletePangolinIdp(idp.idpId)}
                className="px-2 py-1 text-xs text-red-400 hover:bg-red-400/10 rounded transition-colors"
              >
                remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
