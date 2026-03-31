import type { Session } from '@paws/domain-session';
import { useNavigate } from '@tanstack/react-router';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
    return <div className="text-center text-muted-foreground py-12 text-sm">No sessions found.</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Worker</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Started</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((session) => (
          <TableRow
            key={session.sessionId}
            onClick={() => void navigate({ to: `/sessions/${session.sessionId}` })}
            className="cursor-pointer"
          >
            <TableCell className="font-mono">{truncateId(session.sessionId)}</TableCell>
            <TableCell>
              <StatusBadge status={session.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">{session.worker ?? '-'}</TableCell>
            <TableCell className="text-muted-foreground">{formatDuration(session.durationMs)}</TableCell>
            <TableCell className="text-muted-foreground">{formatTime(session.startedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
