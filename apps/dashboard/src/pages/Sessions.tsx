import { getSessions } from '../api/client.js';
import { SessionTable } from '../components/SessionTable.js';
import { usePolling } from '../hooks/usePolling.js';

export function Sessions() {
  const sessions = usePolling(getSessions, 3000);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Sessions</h1>

      {sessions.loading && !sessions.data ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 animate-pulse h-48" />
      ) : sessions.error ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center space-y-3">
          <pre className="text-zinc-600 text-xs leading-tight font-mono inline-block">
            {` /\\_/\\
( -.- )  zzz
 > ^ <`}
          </pre>
          <p className="text-zinc-400 text-sm">No sessions yet.</p>
          <p className="text-zinc-500 text-xs">
            Create a session via the API or CLI to see it here.
          </p>
        </div>
      ) : sessions.data && sessions.data.sessions.length > 0 ? (
        <SessionTable sessions={sessions.data.sessions} />
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center space-y-3">
          <pre className="text-zinc-600 text-xs leading-tight font-mono inline-block">
            {` /\\_/\\
( -.- )  zzz
 > ^ <`}
          </pre>
          <p className="text-zinc-400 text-sm">No sessions yet.</p>
          <p className="text-zinc-500 text-xs">
            Create a session via the API or CLI to see it here.
          </p>
        </div>
      )}
    </div>
  );
}
