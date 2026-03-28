import { useEffect, useState } from 'react';

import { hasApiKey, setApiKey, setSessionMode } from '../api/client.js';

type AuthMode = 'loading' | 'authenticated' | 'login';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AuthMode>('loading');
  const [showApiKey, setShowApiKey] = useState(false);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [oidcAvailable, setOidcAvailable] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    // Check OIDC session first
    try {
      const res = await fetch('/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          setSessionMode(true);
          setMode('authenticated');
          return;
        }
      }
      // /auth/me exists but user not authenticated — OIDC is available
      if (res.status === 401) {
        setOidcAvailable(true);
      }
    } catch {
      // /auth/me not found — OIDC not configured
    }

    // Check API key
    if (hasApiKey()) {
      try {
        const res = await fetch('/v1/fleet', {
          headers: { Authorization: `Bearer ${localStorage.getItem('paws_api_key')}` },
        });
        if (res.ok) {
          setMode('authenticated');
          return;
        }
      } catch {
        // Gateway not reachable
      }
    }

    setMode('login');
  }

  if (mode === 'loading') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Connecting...</div>
      </div>
    );
  }

  if (mode === 'authenticated') return <>{children}</>;

  const handleApiKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      setError('API key is required');
      return;
    }
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
      setMode('authenticated');
    } catch {
      setMode('authenticated');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-full max-w-sm px-4">
        <div className="text-center mb-8">
          <pre className="text-emerald-400 text-sm leading-tight font-mono inline-block">
            {` /\\_/\\
( o.o )
 > ^ <`}
          </pre>
          <h1 className="mt-4 text-xl font-semibold text-zinc-100">paws</h1>
          <p className="mt-1 text-sm text-zinc-500">fleet dashboard</p>
        </div>

        <div className="space-y-3">
          {oidcAvailable && (
            <a
              href="/auth/login"
              className="block w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium text-sm rounded-lg transition-colors text-center"
            >
              Login with SSO
            </a>
          )}

          {!showApiKey && (
            <button
              onClick={() => setShowApiKey(true)}
              className="block w-full py-2.5 border border-zinc-700 hover:border-zinc-600 text-zinc-300 text-sm rounded-lg transition-colors text-center"
            >
              {oidcAvailable ? 'Use API key instead' : 'Login with API key'}
            </button>
          )}

          {showApiKey && (
            <form onSubmit={handleApiKeySubmit} className="space-y-3">
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
                className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium text-sm rounded-lg transition-colors"
              >
                Connect
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          {oidcAvailable ? 'Contact your admin for SSO access' : 'Default dev key: paws-dev-key'}
        </p>
      </div>
    </div>
  );
}
