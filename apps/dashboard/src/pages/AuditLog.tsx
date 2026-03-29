import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';

import {
  getAuditEvents,
  getAuditStats,
  type AuditEvent,
  type AuditFilters,
  type AuditStats,
} from '../api/client.js';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SeverityDot({ severity }: { severity: AuditEvent['severity'] }) {
  const color =
    severity === 'error' ? 'bg-red-400' : severity === 'warn' ? 'bg-amber-400' : 'bg-emerald-400';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function EventRow({
  event,
  expanded,
  onToggle,
}: {
  event: AuditEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasDetails = event.details && Object.keys(event.details).length > 0;

  return (
    <div className="border-b border-zinc-800 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-zinc-800/30 transition-colors"
      >
        <SeverityDot severity={event.severity} />
        <span className="font-mono text-xs text-zinc-300 w-24 shrink-0">
          {timeAgo(event.timestamp)}
        </span>
        <span className="font-mono text-xs text-emerald-400 w-48 shrink-0 truncate">
          {event.action}
        </span>
        <span className="text-xs text-zinc-500 w-24 shrink-0 truncate">{event.actor ?? '-'}</span>
        <span className="text-xs text-zinc-400 flex-1 truncate">
          {event.resourceType && event.resourceId ? (
            event.resourceType === 'session' ? (
              <Link
                to={`/sessions/${event.resourceId}`}
                className="text-emerald-400/70 hover:text-emerald-400 underline underline-offset-2"
                onClick={(e) => e.stopPropagation()}
              >
                {event.resourceId.slice(0, 8)}...
              </Link>
            ) : (
              <span className="font-mono">{event.resourceId}</span>
            )
          ) : null}
        </span>
        {hasDetails && (
          <svg
            className={`w-4 h-4 text-zinc-600 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {expanded && hasDetails && (
        <div className="px-4 pb-3 pl-12">
          <pre className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded p-2 overflow-x-auto">
            {JSON.stringify(event.details, null, 2)}
          </pre>
          <p className="text-xs text-zinc-600 mt-1">{new Date(event.timestamp).toLocaleString()}</p>
        </div>
      )}
    </div>
  );
}

const CATEGORIES = ['', 'session', 'daemon', 'server', 'auth', 'system'] as const;
const SEVERITIES = ['', 'info', 'warn', 'error'] as const;

export function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const fetchEvents = useCallback(async () => {
    try {
      const filters: AuditFilters = { limit, offset };
      if (category) filters.category = category;
      if (severity) filters.severity = severity;
      if (search) filters.search = search;

      const [eventsResult, statsResult] = await Promise.all([
        getAuditEvents(filters),
        getAuditStats(),
      ]);

      if (offset === 0) {
        setEvents(eventsResult.events);
      } else {
        setEvents((prev) => [...prev, ...eventsResult.events]);
      }
      setTotal(eventsResult.total);
      setStats(statsResult);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [category, severity, search, offset]);

  // Fetch on mount and when filters change
  useEffect(() => {
    setLoading(true);
    void fetchEvents();
  }, [fetchEvents]);

  // Auto-refresh every 5s (only first page)
  useEffect(() => {
    if (offset > 0) return;
    const id = setInterval(() => void fetchEvents(), 5000);
    return () => clearInterval(id);
  }, [fetchEvents, offset]);

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
    setEvents([]);
  }, [category, severity, search]);

  const eventsToday = stats ? Object.values(stats.last24h).reduce((a, b) => a + b, 0) : 0;
  const eventsThisWeek = stats ? Object.values(stats.last7d).reduce((a, b) => a + b, 0) : 0;

  const hasMore = events.length < total;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Audit Log</h1>
        {stats && (
          <div className="flex gap-4 text-xs text-zinc-500">
            <span>
              <span className="text-zinc-300">{eventsToday}</span> today
            </span>
            <span>
              <span className="text-zinc-300">{eventsThisWeek}</span> this week
            </span>
            <span>
              <span className="text-zinc-300">{stats.total}</span> total
            </span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-md px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-emerald-400/50"
        >
          <option value="">All categories</option>
          {CATEGORIES.filter(Boolean).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-md px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-emerald-400/50"
        >
          <option value="">All severities</option>
          {SEVERITIES.filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-md px-3 py-1.5 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-emerald-400/50 flex-1 min-w-48"
        />
      </div>

      {/* Content */}
      {loading && events.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 animate-pulse h-48" />
      ) : error ? (
        <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4">
          <p className="text-red-400 text-sm">{error.message}</p>
        </div>
      ) : events.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center space-y-3">
          <pre className="text-zinc-600 text-xs leading-tight font-mono inline-block">
            {` /\\_/\\
( o.o )  nothing here yet
 > ^ <`}
          </pre>
          <p className="text-zinc-400 text-sm">No audit events recorded.</p>
          <p className="text-zinc-500 text-xs">
            Events will appear here as sessions run and daemons are triggered.
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="px-4 py-2 flex items-center gap-3 border-b border-zinc-800 text-xs text-zinc-600 font-medium">
            <span className="w-2" />
            <span className="w-24">Time</span>
            <span className="w-48">Action</span>
            <span className="w-24">Actor</span>
            <span className="flex-1">Resource</span>
          </div>
          {/* Events */}
          {events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              expanded={expandedId === event.id}
              onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <div className="text-center">
          <button
            onClick={() => setOffset(events.length)}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-md hover:bg-zinc-800 transition-colors"
          >
            Load more ({total - events.length} remaining)
          </button>
        </div>
      )}
      {loading && events.length > 0 && (
        <div className="text-center text-zinc-500 text-sm">Loading...</div>
      )}
    </div>
  );
}
