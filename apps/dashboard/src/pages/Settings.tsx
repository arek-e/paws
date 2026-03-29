import { useCallback, useEffect, useState } from 'react';

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
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getAccount()
      .then(setAccount)
      .catch(() => {});
  }, []);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

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
      setSuccess('Password changed successfully. Other sessions have been invalidated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
      <h2 className="text-sm font-semibold text-zinc-100">Account</h2>

      {/* Email display */}
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Email</label>
        <div className="px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 text-sm">
          {account?.email ?? 'Loading...'}
        </div>
      </div>

      {/* Change password form */}
      <form onSubmit={handleChangePassword} className="space-y-3 pt-2">
        <p className="text-xs text-zinc-500 font-medium">Change Password</p>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => {
            setCurrentPassword(e.target.value);
            setError('');
            setSuccess('');
          }}
          placeholder="Current password"
          className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-emerald-400"
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            setError('');
            setSuccess('');
          }}
          placeholder="New password (min 8 characters)"
          className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-emerald-400"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setError('');
            setSuccess('');
          }}
          placeholder="Confirm new password"
          className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-emerald-400"
        />

        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-emerald-400">{success}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {submitting ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </div>
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">Active Sessions</h2>
        {otherSessions.length > 0 && (
          <button
            onClick={handleRevokeAll}
            disabled={revoking === 'all'}
            className="px-3 py-1.5 text-xs text-red-400 border border-red-400/30 hover:bg-red-400/10 rounded-md transition-colors disabled:opacity-50"
          >
            {revoking === 'all' ? 'Revoking...' : 'Revoke all other sessions'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="animate-pulse h-24 bg-zinc-800 rounded-lg" />
      ) : sessions.length === 0 ? (
        <p className="text-sm text-zinc-500">No active sessions.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                <th className="pb-2 font-medium">Token</th>
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium">Expires</th>
                <th className="pb-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {sessions.map((s) => (
                <tr key={s.tokenPrefix} className="text-zinc-300">
                  <td className="py-2.5 font-mono text-xs">
                    {s.tokenPrefix}
                    {s.isCurrent && (
                      <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-400/10 text-emerald-400 rounded">
                        current
                      </span>
                    )}
                  </td>
                  <td className="py-2.5">{s.email}</td>
                  <td className="py-2.5 text-zinc-500 text-xs">{formatExpiry(s.expiresAt)}</td>
                  <td className="py-2.5 text-right">
                    {!s.isCurrent && (
                      <button
                        onClick={() => handleRevoke(s.tokenPrefix)}
                        disabled={revoking === s.tokenPrefix}
                        className="px-2 py-1 text-xs text-red-400 hover:bg-red-400/10 rounded transition-colors disabled:opacity-50"
                      >
                        {revoking === s.tokenPrefix ? 'Revoking...' : 'Revoke'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// System Info Section
// ---------------------------------------------------------------------------

function SystemInfoSection() {
  const info = usePolling(getSystemInfo, 10000);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
      <h2 className="text-sm font-semibold text-zinc-100">System Info</h2>

      {info.loading && !info.data ? (
        <div className="animate-pulse h-32 bg-zinc-800 rounded-lg" />
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
    </div>
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
