import { getFleet, getWorkers } from '../api/client.js';
import { UpdateBanner } from '../components/UpdateBanner.js';
import { MiniChart } from '../components/MiniChart.js';
import { StatCard } from '../components/StatCard.js';
import { WorkerCard } from '../components/WorkerCard.js';
import { Alert, AlertDescription } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { Card, CardContent } from '../components/ui/card.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { useMetrics } from '../hooks/useMetrics.js';
import { usePolling } from '../hooks/usePolling.js';

function TunnelStatus({
  pangolin,
}: {
  pangolin?: { connected: boolean; tunnelWorkers: number; lastPollAt: string | null };
}) {
  if (!pangolin) return null;

  return (
    <Badge
      variant="outline"
      className={`gap-2 px-3 py-1.5 rounded-full ${
        pangolin.connected
          ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20'
          : 'bg-red-400/10 text-red-400 border-red-400/20'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${pangolin.connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}
      />
      {pangolin.connected
        ? `Tunnel active \u00b7 ${pangolin.tunnelWorkers} worker${pangolin.tunnelWorkers !== 1 ? 's' : ''} connected`
        : 'Tunnel disconnected'}
    </Badge>
  );
}

export function Fleet() {
  const fleet = usePolling(getFleet, 5000);
  const workers = usePolling(getWorkers, 5000);

  // Historical charts (last 1 hour)
  const sessionsChart = useMetrics('paws_sessions_active', 60, 30);
  const capacityChart = useMetrics('paws_fleet_capacity_used', 60, 30);
  const workersChart = useMetrics('paws_workers_healthy', 60, 30);
  const requestsChart = useMetrics('sum(rate(paws_http_requests_total[1m]))', 60, 30);

  const fleetData = fleet.data as
    | (typeof fleet.data & {
        pangolin?: { connected: boolean; tunnelWorkers: number; lastPollAt: string | null };
      })
    | undefined;

  return (
    <div className="space-y-6">
      <UpdateBanner />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Fleet Overview</h1>
        <TunnelStatus pangolin={fleetData?.pangolin} />
      </div>

      {fleet.loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : fleet.error ? (
        <Alert variant="destructive" className="bg-red-400/10 border-red-400/20 text-red-400">
          <AlertDescription>Failed to load fleet data: {fleet.error.message}</AlertDescription>
        </Alert>
      ) : fleet.data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Workers" value={fleet.data.totalWorkers} />
          <StatCard label="Healthy" value={fleet.data.healthyWorkers} color="emerald" />
          <StatCard label="Active Sessions" value={fleet.data.activeSessions} color="amber" />
          <StatCard label="Queued" value={fleet.data.queuedSessions} />
        </div>
      ) : null}

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniChart data={sessionsChart.data} label="Active Sessions (1h)" color="#fbbf24" />
        <MiniChart data={capacityChart.data} label="Capacity Used (1h)" color="#f87171" />
        <MiniChart data={workersChart.data} label="Healthy Workers (1h)" color="#34d399" />
        <MiniChart data={requestsChart.data} label="Requests/s (1h)" color="#60a5fa" />
      </div>

      {/* Workers */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
          Workers
        </h2>
        {workers.loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : workers.error ? (
          <Alert variant="destructive" className="bg-red-400/10 border-red-400/20 text-red-400">
            <AlertDescription>Failed to load trees: {workers.error.message}</AlertDescription>
          </Alert>
        ) : workers.data && workers.data.workers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workers.data.workers.map((w) => (
              <WorkerCard key={w.name} worker={w} />
            ))}
          </div>
        ) : (
          <Card className="bg-zinc-900 border-zinc-800 py-0 shadow-none">
            <CardContent className="p-8 text-center">
              <pre className="text-zinc-600 text-xs font-mono mb-2">{`   /\\_/\\
  ( -.- )
   > ^ <`}</pre>
              <p className="text-zinc-500 text-sm">No workers connected.</p>
              <p className="text-zinc-600 text-xs mt-1">
                Add a server from{' '}
                <a href="/servers" className="text-emerald-500 hover:text-emerald-400">
                  Servers
                </a>{' '}
                or run the{' '}
                <a href="/setup" className="text-emerald-500 hover:text-emerald-400">
                  setup wizard
                </a>
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
