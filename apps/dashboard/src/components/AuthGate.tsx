import { useState } from 'react';

import { hasApiKey, setApiKey } from '../api/client.js';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(hasApiKey());
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  if (authed) return <>{children}</>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      setError('API key is required');
      return;
    }

    // Test the key against the health endpoint (which requires no auth)
    // and then the fleet endpoint (which does)
    setApiKey(key.trim());
    try {
      const res = await fetch('/v1/fleet', {
        headers: { Authorization: `Bearer ${key.trim()}` },
      });
      if (res.status === 401) {
        setError('Invalid API key');
        setApiKey('');
        return;
      }
      setAuthed(true);
    } catch {
      // Network error, but key might still be valid (no gateway running)
      // Let them through and errors will show on the dashboard
      setAuthed(true);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <pre className="text-emerald-400 text-sm leading-tight font-mono inline-block">
            {` /\\_/\\
( o.o )
 > ^ <`}
          </pre>
          <h1 className="mt-4 text-xl font-semibold text-zinc-100">paws dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">Enter your gateway API key to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError('');
              }}
              placeholder="API key"
              autoFocus
              className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/50"
            />
            {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium text-sm rounded-lg transition-colors"
          >
            Connect
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Default dev key: <code className="text-zinc-500">paws-dev-key</code>
        </p>
      </div>
    </div>
  );
}
