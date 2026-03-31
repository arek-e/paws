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
import { Alert, AlertDescription } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { usePolling } from '../hooks/usePolling.js';

export function Tunnels() {
  const status = usePolling(getPangolinStatus, 10000);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Tunnels</h1>
          {status.data && (
            <Badge
              className={`gap-1.5 rounded-full border ${
                status.data.reachable
                  ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20'
                  : 'bg-red-400/10 text-red-400 border-red-400/20'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${status.data.reachable ? 'bg-emerald-400' : 'bg-red-400'}`}
              />
              {status.data.reachable ? 'Pangolin connected' : 'Pangolin unreachable'}
            </Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="tunnels">
        <TabsList variant="line" className="border-b border-zinc-800 w-full justify-start">
          {(['tunnels', 'sites', 'users', 'sso'] as const).map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              className="capitalize data-[state=active]:text-emerald-400"
            >
              {t === 'sso' ? 'SSO' : t}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="tunnels">
          <TunnelsTab />
        </TabsContent>
        <TabsContent value="sites">
          <SitesTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="sso">
          <SsoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TunnelsTab() {
  const resources = usePolling(getPangolinResources, 5000);

  async function handleDelete(id: string | number) {
    await deletePangolinResource(id);
  }

  if (resources.loading && !resources.data) {
    return <Skeleton className="h-32 bg-zinc-800 rounded-lg" />;
  }
  if (resources.error) {
    return (
      <Alert variant="destructive" className="bg-red-400/10 border-red-400/20">
        <AlertDescription className="text-red-400 text-sm">
          {resources.error.message}
        </AlertDescription>
      </Alert>
    );
  }

  const items = resources.data ?? [];
  if (items.length === 0) {
    return (
      <Card className="bg-zinc-900 border-zinc-800 py-0">
        <CardContent className="p-8 text-center">
          <p className="text-zinc-500 text-sm">
            No active tunnels. Exposed ports appear here when sessions with{' '}
            <code className="text-zinc-400">network.expose</code> are running.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((r: PangolinResource) => (
        <Card key={r.resourceId} className="bg-zinc-900 border-zinc-800 gap-0 py-0">
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className="font-mono bg-zinc-800 text-zinc-300 border-zinc-700"
              >
                {r.fullDomain ?? r.subdomain ?? r.name}
              </Badge>
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(r.resourceId)}
              className="text-red-400 hover:bg-red-400/10 hover:text-red-400"
            >
              delete
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SitesTab() {
  const sites = usePolling(getPangolinSites, 5000);

  if (sites.loading && !sites.data) {
    return <Skeleton className="h-32 bg-zinc-800 rounded-lg" />;
  }

  const items = sites.data ?? [];
  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800 py-0">
          <CardContent className="p-8 text-center">
            <p className="text-zinc-500 text-sm">No sites registered. Workers connect via Newt.</p>
          </CardContent>
        </Card>
      ) : (
        items.map((s: PangolinSite) => (
          <Card key={s.siteId} className="bg-zinc-900 border-zinc-800 gap-0 py-0">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-100">{s.name}</span>
                <Badge
                  className={`rounded-full border ${
                    s.online
                      ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20'
                      : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                  }`}
                >
                  {s.online ? 'online' : 'offline'}
                </Badge>
                <span className="text-xs text-zinc-600">{s.type}</span>
              </div>
              <span className="text-xs text-zinc-600 font-mono">{s.siteId}</span>
            </CardContent>
          </Card>
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
        <Input
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder="email@example.com"
          className="flex-1 bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
          onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
        />
        <Button
          onClick={handleInvite}
          disabled={inviting || !inviteEmail.trim()}
          className="bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {inviting ? 'Inviting...' : 'Invite'}
        </Button>
      </div>

      <div className="space-y-2">
        {(users.data ?? []).map((u: PangolinUser) => (
          <Card key={u.userId} className="bg-zinc-900 border-zinc-800 gap-0 py-0">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-100">{u.email}</span>
                {u.name && <span className="text-xs text-zinc-500">{u.name}</span>}
                {u.role && (
                  <Badge variant="outline" className="bg-zinc-800 text-zinc-400 border-zinc-700">
                    {u.role}
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(u.userId)}
                className="text-red-400 hover:bg-red-400/10 hover:text-red-400"
              >
                remove
              </Button>
            </CardContent>
          </Card>
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
        <Button
          onClick={() => setShowSetup(!showSetup)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {showSetup ? 'Cancel' : 'Add Dex SSO'}
        </Button>
      </div>

      {showSetup && (
        <Card className="bg-zinc-900 border-zinc-800 gap-0 py-0">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-zinc-300">
              This will register Dex (your existing OIDC provider) as a Pangolin identity provider.
              Users who can log into the paws dashboard will also be able to access exposed tunnel
              URLs.
            </p>
            <p className="text-xs text-zinc-500">
              Make sure the <code className="text-zinc-400">PANGOLIN_OIDC_SECRET</code> env var is
              set and matches the Dex client secret. The setup script generates this automatically.
            </p>
            <Button
              onClick={handleAutoSetup}
              disabled={setting}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {setting ? 'Configuring...' : 'Configure Dex SSO'}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {(idps.data ?? []).length === 0 ? (
          <Card className="bg-zinc-900 border-zinc-800 py-0">
            <CardContent className="p-8 text-center">
              <p className="text-zinc-500 text-sm">
                No identity providers configured. Add Dex SSO so tunnel URLs use the same login as
                the dashboard.
              </p>
            </CardContent>
          </Card>
        ) : (
          (idps.data ?? []).map((idp: PangolinIdp) => (
            <Card key={idp.idpId} className="bg-zinc-900 border-zinc-800 gap-0 py-0">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-zinc-100">{idp.name}</span>
                  <Badge className="bg-blue-400/10 text-blue-400 border border-blue-400/20">
                    {idp.type}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deletePangolinIdp(idp.idpId)}
                  className="text-red-400 hover:bg-red-400/10 hover:text-red-400"
                >
                  remove
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
