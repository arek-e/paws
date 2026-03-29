import { Link } from '@tanstack/react-router';

import { getDaemons } from '../api/client.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { usePolling } from '../hooks/usePolling.js';

interface Daemon {
  role: string;
  description: string;
  status: 'active' | 'paused' | 'stopped';
  trigger: { type: string; cron?: string; events?: string[] };
  stats: { totalInvocations: number; lastInvokedAt?: string; avgDurationMs?: number };
  network?: {
    expose?: Array<{ port: number; label?: string }>;
  };
}

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimeAgo(iso?: string): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function TriggerBadge({ trigger }: { trigger: Daemon['trigger'] }) {
  const colors: Record<string, string> = {
    webhook: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
    schedule: 'bg-purple-400/10 text-purple-400 border-purple-400/20',
    watch: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  };
  const labels: Record<string, string> = {
    webhook: trigger.events?.join(', ') ?? 'webhook',
    schedule: trigger.cron ?? 'schedule',
    watch: 'watch',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${colors[trigger.type] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}
    >
      {labels[trigger.type] ?? trigger.type}
    </span>
  );
}

export function Daemons() {
  const daemons = usePolling(getDaemons, 5000);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Daemons</h1>
        <p className="text-xs text-zinc-500">Persistent agent roles that respond to triggers</p>
      </div>

      {daemons.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 h-24 animate-pulse"
            />
          ))}
        </div>
      ) : daemons.error ? (
        <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4 text-red-400 text-sm">
          Failed to load daemons: {daemons.error.message}
        </div>
      ) : daemons.data && daemons.data.daemons.length > 0 ? (
        <div className="space-y-3">
          {(daemons.data.daemons as Daemon[]).map((d) => (
            <div key={d.role} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-zinc-100">{d.role}</h3>
                  <StatusBadge status={d.status} />
                </div>
                <TriggerBadge trigger={d.trigger} />
              </div>
              {d.description && <p className="text-xs text-zinc-400 mb-3">{d.description}</p>}
              {d.network?.expose && d.network.expose.length > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-zinc-500">Exposed ports:</span>
                  {d.network.expose.map((ep) => (
                    <span
                      key={ep.port}
                      className="px-1.5 py-0.5 text-xs font-mono rounded bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                    >
                      :{ep.port}
                      {ep.label ? ` ${ep.label}` : ''}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-6 text-xs">
                <div>
                  <span className="text-zinc-500">Invocations</span>
                  <p className="text-zinc-300">{d.stats.totalInvocations}</p>
                </div>
                <div>
                  <span className="text-zinc-500">Last run</span>
                  <p className="text-zinc-300">{formatTimeAgo(d.stats.lastInvokedAt)}</p>
                </div>
                <div>
                  <span className="text-zinc-500">Avg duration</span>
                  <p className="text-zinc-300">{formatDuration(d.stats.avgDurationMs)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
          <pre className="text-zinc-600 text-xs font-mono mb-2">{`   /\\_/\\
  ( o.o )
   > ^ <`}</pre>
          <p className="text-zinc-500 text-sm">No daemons registered yet.</p>
          <p className="text-zinc-600 text-xs mt-1">
            <Link to="/templates" className="text-emerald-400 hover:text-emerald-300">
              Browse templates
            </Link>{' '}
            or create a daemon with <code className="text-zinc-500">POST /v1/daemons</code>
          </p>
        </div>
      )}
    </div>
  );
}
