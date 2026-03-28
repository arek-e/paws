import type { Worker } from '@paws/types';

import { StatusBadge } from './StatusBadge.js';

function formatUptime(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function WorkerCard({ worker }: { worker: Worker }) {
  const { capacity } = worker;
  const usedPct =
    capacity.maxConcurrent > 0 ? Math.round((capacity.running / capacity.maxConcurrent) * 100) : 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">{worker.name}</h3>
        <StatusBadge status={worker.status} />
      </div>

      <div>
        <div className="flex justify-between text-xs text-zinc-400 mb-1">
          <span>Capacity</span>
          <span>
            {capacity.running}/{capacity.maxConcurrent}
          </span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-zinc-500">Uptime</span>
          <p className="text-zinc-300">{formatUptime(worker.uptime)}</p>
        </div>
        <div>
          <span className="text-zinc-500">Queued</span>
          <p className="text-zinc-300">{capacity.queued}</p>
        </div>
        <div>
          <span className="text-zinc-500">Snapshot</span>
          <p className="text-zinc-300">{worker.snapshot.id}</p>
        </div>
        <div>
          <span className="text-zinc-500">Snap version</span>
          <p className="text-zinc-300">v{worker.snapshot.version}</p>
        </div>
      </div>
    </div>
  );
}
