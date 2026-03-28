import { getFleet, getWorkers } from '../api/client.js';
import { StatCard } from '../components/StatCard.js';
import { WorkerCard } from '../components/WorkerCard.js';
import { usePolling } from '../hooks/usePolling.js';

export function Fleet() {
  const fleet = usePolling(getFleet, 5000);
  const workers = usePolling(getWorkers, 5000);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Fleet Overview</h1>

      {fleet.loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 h-20 animate-pulse"
            />
          ))}
        </div>
      ) : fleet.error ? (
        <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4 text-red-400 text-sm">
          Failed to load fleet data: {fleet.error.message}
        </div>
      ) : fleet.data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Workers" value={fleet.data.totalWorkers} />
          <StatCard label="Healthy Workers" value={fleet.data.healthyWorkers} color="emerald" />
          <StatCard label="Active Sessions" value={fleet.data.activeSessions} color="amber" />
          <StatCard label="Queued Sessions" value={fleet.data.queuedSessions} />
        </div>
      ) : null}

      <div>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
          Workers
        </h2>
        {workers.loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 h-40 animate-pulse"
              />
            ))}
          </div>
        ) : workers.error ? (
          <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4 text-red-400 text-sm">
            Failed to load workers: {workers.error.message}
          </div>
        ) : workers.data && workers.data.workers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workers.data.workers.map((w) => (
              <WorkerCard key={w.name} worker={w} />
            ))}
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
            <p className="text-zinc-500 text-sm">No workers connected.</p>
            <p className="text-zinc-600 text-xs mt-1">
              Start a worker with{' '}
              <code className="text-zinc-500">bun run apps/worker/src/server.ts</code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
