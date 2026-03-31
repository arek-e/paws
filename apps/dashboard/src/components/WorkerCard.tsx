import type { Worker } from '@paws/domain-fleet';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

import { StatusBadge } from './StatusBadge.js';

function formatUptime(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function extractTreeName(name: string): string {
  // http://65.108.10.170:3000 → 65.108.10.170
  try {
    const url = new URL(name);
    return url.hostname;
  } catch {
    return name;
  }
}

export function WorkerCard({ worker }: { worker: Worker }) {
  const { capacity } = worker;
  const usedPct =
    capacity.maxConcurrent > 0 ? Math.round((capacity.running / capacity.maxConcurrent) * 100) : 0;

  const treeName = extractTreeName(worker.name);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">{treeName}</CardTitle>
        <StatusBadge status={worker.status} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Capacity</span>
            <span>
              {capacity.running}/{capacity.maxConcurrent}
            </span>
          </div>
          <Progress value={usedPct} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Uptime</span>
            <p className="text-foreground">{formatUptime(worker.uptime)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Queued</span>
            <p className="text-foreground">{capacity.queued}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Available</span>
            <p className="text-foreground">{capacity.available} slots</p>
          </div>
          <div>
            <span className="text-muted-foreground">Snapshot</span>
            <p className="text-foreground">
              {worker.snapshot.id} v{worker.snapshot.version}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
