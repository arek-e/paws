import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

export type SessionNodeData = {
  sessionId: string;
  status: string;
  daemonRole?: string;
  startedAt?: string;
};

export type SessionNodeType = Node<SessionNodeData, 'session'>;

function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remainder = s % 60;
  return `${m}m ${remainder}s`;
}

export function SessionNode({ data }: NodeProps<SessionNodeType>) {
  const navigate = useNavigate();
  const [, setTick] = useState(0);

  // Tick every second to update duration
  useEffect(() => {
    if (data.status !== 'running' || !data.startedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [data.status, data.startedAt]);

  const borderColor =
    data.status === 'pending'
      ? 'border-amber-400/60'
      : data.status === 'running'
        ? 'border-emerald-400/60'
        : 'border-zinc-600';

  const statusDot =
    data.status === 'pending'
      ? 'bg-amber-400 animate-pulse'
      : data.status === 'running'
        ? 'bg-emerald-400 animate-pulse'
        : 'bg-zinc-500';

  return (
    <div
      className={`px-3 py-2 rounded-md bg-zinc-800 border ${borderColor} min-w-[140px] cursor-pointer hover:bg-zinc-750 transition-colors shadow-sm`}
      onClick={() => navigate({ to: `/sessions/${data.sessionId}` })}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-zinc-600 !w-1.5 !h-1.5 !border-0"
      />

      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
        <span className="text-xs font-mono text-zinc-300 truncate">
          {data.sessionId.slice(0, 8)}
        </span>
      </div>

      <pre className="text-[8px] leading-tight text-zinc-600 font-mono select-none mb-1">{` /\\_/\\
( o.o )`}</pre>

      <div className="flex items-center justify-between text-[10px] text-zinc-500">
        {data.daemonRole && <span className="truncate max-w-[80px]">{data.daemonRole}</span>}
        {data.startedAt && data.status === 'running' && (
          <span className="text-emerald-400/80 font-mono">{formatDuration(data.startedAt)}</span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-zinc-600 !w-1.5 !h-1.5 !border-0"
      />
    </div>
  );
}
