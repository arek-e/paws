import type { Session } from '@paws/types';
import { useNavigate } from '@tanstack/react-router';

import { StatusBadge } from './StatusBadge.js';

function truncateId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}...` : id;
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(ts: string | undefined): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleTimeString();
}

export function SessionTable({ sessions }: { sessions: Session[] }) {
  const navigate = useNavigate();

  if (sessions.length === 0) {
    return <div className="text-center text-zinc-500 py-12 text-sm">No sessions found.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-400 text-left">
            <th className="pb-2 pr-4 font-medium">ID</th>
            <th className="pb-2 pr-4 font-medium">Status</th>
            <th className="pb-2 pr-4 font-medium">Worker</th>
            <th className="pb-2 pr-4 font-medium">Duration</th>
            <th className="pb-2 font-medium">Started</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr
              key={session.sessionId}
              onClick={() => void navigate({ to: `/sessions/${session.sessionId}` })}
              className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer transition-colors"
            >
              <td className="py-2 pr-4 font-mono text-zinc-300">{truncateId(session.sessionId)}</td>
              <td className="py-2 pr-4">
                <StatusBadge status={session.status} />
              </td>
              <td className="py-2 pr-4 text-zinc-400">{session.worker ?? '-'}</td>
              <td className="py-2 pr-4 text-zinc-400">{formatDuration(session.durationMs)}</td>
              <td className="py-2 text-zinc-400">{formatTime(session.startedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
