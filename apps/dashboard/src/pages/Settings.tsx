import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  changePassword,
  getAccount,
  getActiveSessions,
  getSystemInfo,
  revokeOtherSessions,
  revokeSession,
  type AccountInfo,
  type SessionInfo,
} from '../api/client.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Skeleton } from '../components/ui/skeleton.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.js';
import { usePolling } from '../hooks/usePolling.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatExpiry(expiresAt: number): string {
  const now = Date.now();
  const remaining = expiresAt - now;
  if (remaining <= 0) return 'Expired';
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h remaining`;
  return `${hours}h remaining`;
}

// ---------------------------------------------------------------------------
// Account Section
// ---------------------------------------------------------------------------

function AccountSection() {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getAccount()
      .then(setAccount)
      .catch(() => {});
  }, []);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!currentPassword) {
      setError('Current password is required');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully. Other sessions have been invalidated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800 gap-0 py-0">
      <CardHeader className="p-6 pb-0">
        <CardTitle className="text-sm text-zinc-100">Account</CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {/* Email display */}
        <div>
          <Label className="text-xs text-zinc-500 mb-1">Email</Label>
          <div className="px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 text-sm">
            {account?.email ?? 'Loading...'}
          </div>
        </div>

        {/* Change password form */}
        <form onSubmit={handleChangePassword} className="space-y-3 pt-2">
          <p className="text-xs text-zinc-500 font-medium">Change Password</p>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              setError('');
            }}
            placeholder="Current password"
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-500 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/20"
          />
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setError('');
            }}
            placeholder="New password (min 8 characters)"
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-500 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/20"
          />
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setError('');
            }}
            placeholder="Confirm new password"
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-500 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/20"
          />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <Button
            type="submit"
            disabled={submitting}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {submitting ? 'Changing...' : 'Change Password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Active Sessions Section
// ---------------------------------------------------------------------------

function ActiveSessionsSection() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await getActiveSessions();
      setSessions(data);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  async function handleRevoke(tokenPrefix: string) {
    setRevoking(tokenPrefix);
    try {
      await revokeSession(tokenPrefix);
      await fetchSessions();
    } catch {
      // Ignore
    } finally {
      setRevoking(null);
    }
  }

  async function handleRevokeAll() {
    setRevoking('all');
    try {
      await revokeOtherSessions();
      await fetchSessions();
    } catch {
      // Ignore
    } finally {
      setRevoking(null);
    }
  }

  const otherSessions = sessions.filter((s) => !s.isCurrent);

  return (
    <Card className="bg-zinc-900 border-zinc-800 gap-0 py-0">
      <CardHeader className="p-6 pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-zinc-100">Active Sessions</CardTitle>
          {otherSessions.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRevokeAll}
              disabled={revoking === 'all'}
              className="bg-transparent border border-red-400/30 text-red-400 hover:bg-red-400/10 hover:text-red-400"
            >
              {revoking === 'all' ? 'Revoking...' : 'Revoke all other sessions'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {loading ? (
          <Skeleton className="h-24 bg-zinc-800" />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-zinc-500">No active sessions.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-xs text-zinc-500 font-medium">Token</TableHead>
                <TableHead className="text-xs text-zinc-500 font-medium">Email</TableHead>
                <TableHead className="text-xs text-zinc-500 font-medium">Expires</TableHead>
                <TableHead className="text-xs text-zinc-500 font-medium" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow
                  key={s.tokenPrefix}
                  className="border-zinc-800 text-zinc-300 hover:bg-transparent"
                >
                  <TableCell className="py-2.5 font-mono text-xs">
                    {s.tokenPrefix}
                    {s.isCurrent && (
                      <Badge className="ml-2 bg-emerald-400/10 text-emerald-400 border-emerald-400/20 text-[10px] font-semibold">
                        current
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-2.5">{s.email}</TableCell>
                  <TableCell className="py-2.5 text-zinc-500 text-xs">
                    {formatExpiry(s.expiresAt)}
                  </TableCell>
                  <TableCell className="py-2.5 text-right">
                    {!s.isCurrent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(s.tokenPrefix)}
                        disabled={revoking === s.tokenPrefix}
                        className="text-red-400 hover:bg-red-400/10 hover:text-red-400"
                      >
                        {revoking === s.tokenPrefix ? 'Revoking...' : 'Revoke'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// System Info Section
// ---------------------------------------------------------------------------

function SystemInfoSection() {
  const info = usePolling(getSystemInfo, 10000);

  return (
    <Card className="bg-zinc-900 border-zinc-800 gap-0 py-0">
      <CardHeader className="p-6 pb-0">
        <CardTitle className="text-sm text-zinc-100">System Info</CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {info.loading && !info.data ? (
          <Skeleton className="h-32 bg-zinc-800" />
        ) : info.data ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <InfoItem label="Version" value={info.data.version} />
            <InfoItem
              label="Commit"
              value={info.data.commit === 'unknown' ? 'dev' : info.data.commit.slice(0, 8)}
            />
            <InfoItem
              label="Build Date"
              value={info.data.buildDate === 'unknown' ? 'dev' : info.data.buildDate}
            />
            <InfoItem label="Uptime" value={formatUptime(info.data.uptime)} />
            <InfoItem label="Workers" value={String(info.data.workers)} />
            <InfoItem label="Daemons" value={String(info.data.daemons)} />
            <InfoItem label="Auth Sessions" value={String(info.data.authSessions)} />
            <InfoItem label="Active VM Sessions" value={String(info.data.activeSessions)} />
            <InfoItem
              label="DB Size"
              value={info.data.dbSizeBytes != null ? formatBytes(info.data.dbSizeBytes) : 'N/A'}
            />
          </div>
        ) : info.error ? (
          <p className="text-sm text-zinc-500">Failed to load system info.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-sm text-zinc-200 font-mono mt-0.5">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings Page
// ---------------------------------------------------------------------------

export function Settings() {
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <AccountSection />
      <ActiveSessionsSection />
      <SystemInfoSection />
    </div>
  );
}
