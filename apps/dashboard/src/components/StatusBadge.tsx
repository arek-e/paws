type Status =
  | 'active'
  | 'paused'
  | 'stopped'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelled'
  | 'healthy'
  | 'degraded'
  | 'unhealthy';

const styles: Record<string, string> = {
  pending: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  running: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
  completed: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
  failed: 'bg-red-400/10 text-red-400 border-red-400/20',
  timeout: 'bg-orange-400/10 text-orange-400 border-orange-400/20',
  cancelled: 'bg-zinc-400/10 text-zinc-400 border-zinc-400/20',
  healthy: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
  degraded: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  unhealthy: 'bg-red-400/10 text-red-400 border-red-400/20',
};

export function StatusBadge({ status }: { status: Status }) {
  const cls = styles[status] ?? 'bg-zinc-400/10 text-zinc-400 border-zinc-400/20';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}
    >
      {status}
    </span>
  );
}
