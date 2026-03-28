import { useEffect, useState } from 'react';

interface MetricPoint {
  timestamp: number;
  value: number;
}

interface UseMetricsResult {
  data: MetricPoint[];
  loading: boolean;
  error: string | null;
}

export function useMetrics(query: string, rangeMinutes = 60, stepSeconds = 60): UseMetricsResult {
  const [data, setData] = useState<MetricPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchMetrics() {
      try {
        const end = Math.floor(Date.now() / 1000);
        const start = end - rangeMinutes * 60;
        const params = new URLSearchParams({
          query,
          start: String(start),
          end: String(end),
          step: String(stepSeconds),
        });

        const res = await fetch(`/v1/metrics/query?${params}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch metrics');

        const json = await res.json();
        const series = json.data?.result?.[0]?.values ?? [];
        const points: MetricPoint[] = series.map(([ts, val]: [number, string]) => ({
          timestamp: ts * 1000,
          value: parseFloat(val),
        }));

        if (!cancelled) {
          setData(points);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchMetrics();
    const interval = setInterval(() => void fetchMetrics(), 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [query, rangeMinutes, stepSeconds]);

  return { data, loading, error };
}
