import { useMemo, useState } from 'react';
import { getSessions } from '../api/client.js';
import { SessionTable } from '../components/SessionTable.js';
import { Card, CardContent } from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { usePolling } from '../hooks/usePolling.js';

const STATUS_OPTIONS = [
  'pending',
  'running',
  'completed',
  'failed',
  'timeout',
  'cancelled',
] as const;

export function Sessions() {
  const sessions = usePolling(getSessions, 3000);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const allSessions = sessions.data?.sessions ?? [];

  const filtered = useMemo(() => {
    return allSessions.filter((s) => {
      if (statusFilter && s.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return s.sessionId.toLowerCase().includes(q) || (s.worker ?? '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [allSessions, statusFilter, search]);

  const emptyState = (
    <Card className="bg-zinc-900 border-zinc-800 py-0 shadow-none">
      <CardContent className="p-8 text-center space-y-3">
        <pre className="text-zinc-600 text-xs leading-tight font-mono inline-block">
          {` /\\_/\\
( -.- )  zzz
 > ^ <`}
        </pre>
        <p className="text-zinc-400 text-sm">No sessions yet.</p>
        <p className="text-zinc-500 text-xs">Create a session via the API or CLI to see it here.</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Sessions</h1>

      {sessions.loading && !sessions.data ? (
        <Skeleton className="h-48" />
      ) : sessions.error ? (
        emptyState
      ) : allSessions.length > 0 ? (
        <>
          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-md px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-600"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
            <Input
              placeholder="Search session ID or worker..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <span className="text-zinc-500 text-xs ml-auto">
              Showing {filtered.length} of {allSessions.length} sessions
            </span>
          </div>
          {filtered.length > 0 ? (
            <SessionTable sessions={filtered} />
          ) : (
            <Card className="bg-zinc-900 border-zinc-800 py-0 shadow-none">
              <CardContent className="p-8 text-center">
                <p className="text-zinc-400 text-sm">No sessions match your filters.</p>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        emptyState
      )}
    </div>
  );
}
