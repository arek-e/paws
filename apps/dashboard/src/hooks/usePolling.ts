import { useCallback, useEffect, useRef, useState } from 'react';

interface UsePollingResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number): UsePollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const doFetch = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void doFetch();
    const id = setInterval(() => void doFetch(), intervalMs);
    return () => clearInterval(id);
  }, [doFetch, intervalMs]);

  return { data, loading, error };
}
