import { useCallback, useEffect, useState } from 'react';

import { getAuditStats, getCostSummary, type AuditStats, type CostSummary } from '../api/client.js';
import { Alert, AlertDescription } from '../components/ui/alert.js';
import { Card, CardContent } from '../components/ui/card.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { StatCard } from '../components/StatCard.js';

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function Observability() {
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [costResult, statsResult] = await Promise.all([getCostSummary(), getAuditStats()]);
      setCost(costResult);
      setStats(statsResult);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const id = setInterval(() => void fetchData(), 10_000);
    return () => clearInterval(id);
  }, [fetchData]);

  const avgCostPerSession =
    cost && cost.totalSessions > 0 ? (cost.totalVcpuSeconds / cost.totalSessions).toFixed(1) : '0';

  const eventsToday = stats ? Object.values(stats.last24h).reduce((a, b) => a + b, 0) : 0;
  const eventsThisWeek = stats ? Object.values(stats.last7d).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Observability</h1>
      </div>

      {/* Cost Summary Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive" className="bg-red-400/10 border-red-400/20 text-red-400">
          <AlertDescription>Failed to load observability data: {error.message}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Total vCPU-seconds"
              value={formatNumber(cost?.totalVcpuSeconds ?? 0)}
            />
            <StatCard
              label="Total Sessions"
              value={formatNumber(cost?.totalSessions ?? 0)}
              color="emerald"
            />
            <StatCard label="Avg vCPU-sec / Session" value={avgCostPerSession} color="amber" />
            <StatCard label="Events (24h)" value={formatNumber(eventsToday)} />
          </div>

          {/* Activity Summary */}
          <div>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
              Activity Summary
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Last 24h</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {formatNumber(eventsToday)}
                  </p>
                  {stats && (
                    <div className="mt-2 space-y-1">
                      {Object.entries(stats.last24h).map(([category, count]) => (
                        <div key={category} className="flex justify-between text-xs">
                          <span className="text-zinc-500">{category}</span>
                          <span className="text-zinc-300">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Last 7d</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {formatNumber(eventsThisWeek)}
                  </p>
                  {stats && (
                    <div className="mt-2 space-y-1">
                      {Object.entries(stats.last7d).map(([category, count]) => (
                        <div key={category} className="flex justify-between text-xs">
                          <span className="text-zinc-500">{category}</span>
                          <span className="text-zinc-300">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Total Events
                  </p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {formatNumber(stats?.total ?? 0)}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Cost by Daemon */}
          {cost && cost.byDaemon.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
                Cost by Daemon
              </h2>
              <Card className="bg-zinc-900 border-zinc-800 py-0 shadow-none overflow-hidden">
                <CardContent className="p-0">
                  {/* Table header */}
                  <div className="px-4 py-2 flex items-center gap-3 border-b border-zinc-800 text-xs text-zinc-600 font-medium">
                    <span className="flex-1">Role</span>
                    <span className="w-28 text-right">Invocations</span>
                    <span className="w-32 text-right">vCPU-seconds</span>
                    <span className="w-28 text-right">Avg Duration</span>
                  </div>
                  {/* Rows */}
                  {cost.byDaemon.map((daemon) => (
                    <div
                      key={daemon.role}
                      className="px-4 py-3 flex items-center gap-3 border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/30 transition-colors"
                    >
                      <span className="flex-1 text-sm text-zinc-300 font-mono truncate">
                        {daemon.role}
                      </span>
                      <span className="w-28 text-right text-sm text-zinc-400">
                        {formatNumber(daemon.totalInvocations)}
                      </span>
                      <span className="w-32 text-right text-sm text-zinc-400">
                        {formatNumber(daemon.totalVcpuSeconds)}
                      </span>
                      <span className="w-28 text-right text-sm text-zinc-500">
                        {daemon.totalInvocations > 0
                          ? formatDuration(daemon.totalDurationMs / daemon.totalInvocations)
                          : '-'}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Empty state for cost by daemon */}
          {cost && cost.byDaemon.length === 0 && (
            <Card className="bg-zinc-900 border-zinc-800 py-0 shadow-none">
              <CardContent className="p-8 text-center space-y-3">
                <pre className="text-zinc-600 text-xs leading-tight font-mono inline-block">
                  {` /\\_/\\
( o.o )  no daemon activity yet
 > ^ <`}
                </pre>
                <p className="text-zinc-400 text-sm">No cost data recorded.</p>
                <p className="text-zinc-500 text-xs">
                  Cost breakdown will appear here as daemons run sessions.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
