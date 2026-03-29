import { useCallback, useEffect, useRef, useState } from 'react';

import { executeBrowserAction, takeBrowserScreenshot } from '../api/client.js';

interface BrowserViewProps {
  sessionId: string;
  width: number;
  height: number;
  /** Whether the session is still active (enables auto-refresh) */
  active: boolean;
}

export function BrowserView({ sessionId, width, height, active }: BrowserViewProps) {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await takeBrowserScreenshot(sessionId);
      if (res.image) {
        setScreenshot(res.image);
        setLastUpdated(res.timestamp);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to capture screenshot');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Auto-refresh every 2s when session is active
  useEffect(() => {
    if (!active) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    void refresh();
    intervalRef.current = setInterval(() => void refresh(), 2000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active, refresh]);

  const handleGoto = async () => {
    const url = prompt('Navigate to URL:');
    if (url) {
      try {
        await executeBrowserAction(sessionId, { type: 'goto', url });
        void refresh();
      } catch {
        // ignore
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Browser</h2>
          <span className="text-xs text-zinc-600">
            {width}x{height}
          </span>
          {active && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-zinc-600">
              {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={handleGoto}
            disabled={!active}
            className="px-2 py-1 text-xs rounded bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Go to URL
          </button>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="px-2 py-1 text-xs rounded bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? 'Capturing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div
        className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden"
        style={{ aspectRatio: `${width}/${height}` }}
      >
        {error ? (
          <div className="flex items-center justify-center h-full text-red-400 text-sm p-4">
            {error}
          </div>
        ) : screenshot ? (
          <img
            src={`data:image/png;base64,${screenshot}`}
            alt="Browser screenshot"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
            {loading ? 'Capturing screenshot...' : 'No screenshot available'}
          </div>
        )}
      </div>
    </div>
  );
}
