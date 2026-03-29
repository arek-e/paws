import { useEffect, useState } from 'react';

import { setApiKey, setSessionMode } from '../api/client.js';

type AuthMode = 'loading' | 'authenticated' | 'create-account' | 'login';

interface SetupStatus {
  isFirstRun: boolean;
  needsAccount: boolean;
  oidcAvailable: boolean;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AuthMode>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [oidcAvailable, setOidcAvailable] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    // Check setup status
    try {
      const setupRes = await fetch('/v1/setup/status');
      if (setupRes.ok) {
        const data = (await setupRes.json()) as SetupStatus;
        if (data.oidcAvailable) setOidcAvailable(true);
        if (data.needsAccount) {
          setMode('create-account');
          return;
        }
      }
    } catch {
      // Endpoint not available
    }

    // Check existing session cookie
    try {
      const sessionRes = await fetch('/auth/session', { credentials: 'include' });
      if (sessionRes.ok) {
        const data = (await sessionRes.json()) as { authenticated: boolean };
        if (data.authenticated) {
          setMode('authenticated');
          return;
        }
      }
    } catch {
      // No session
    }

    // Check OIDC session
    if (oidcAvailable) {
      try {
        const res = await fetch('/auth/me', { credentials: 'include' });
        if (res.ok) {
          const data = (await res.json()) as { authenticated: boolean };
          if (data.authenticated) {
            setSessionMode(true);
            setMode('authenticated');
            return;
          }
        }
      } catch {
        // OIDC not working
      }
    }

    setMode('login');
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Email and password required');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    try {
      const res = await fetch('/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: 'include',
      });
      if (res.ok) {
        setMode('authenticated');
        return;
      }
      const body = (await res.json()) as { error?: { message?: string } };
      setError(body.error?.message ?? 'Failed to create account');
    } catch {
      setError('Could not connect to server');
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Email and password required');
      return;
    }

    try {
      const res = await fetch('/auth/password-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: 'include',
      });
      if (res.ok) {
        setMode('authenticated');
        return;
      }
      if (res.status === 401) {
        setError('Invalid email or password');
        return;
      }
      setError('Login failed');
    } catch {
      setError('Could not connect to server');
    }
  }

  if (mode === 'loading') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Connecting...</div>
      </div>
    );
  }

  if (mode === 'authenticated') return <>{children}</>;

  const isCreating = mode === 'create-account';

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
          <p className="mt-1 text-sm text-zinc-500">
            {isCreating ? 'Create your admin account' : 'Protected Agent Workspace Sandboxes'}
          </p>
        </div>

        <form onSubmit={isCreating ? handleCreateAccount : handleLogin} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            placeholder="Email"
            autoFocus
            className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-emerald-400"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            placeholder={isCreating ? 'Password (min 8 characters)' : 'Password'}
            className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-emerald-400"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-lg transition-colors"
          >
            {isCreating ? 'Create Account' : 'Login'}
          </button>
        </form>

        {!isCreating && oidcAvailable && (
          <a
            href="/auth/login"
            className="block mt-3 w-full py-2.5 border border-zinc-700 hover:border-zinc-600 text-zinc-300 text-sm rounded-lg transition-colors text-center"
          >
            Login with SSO
          </a>
        )}

        <p className="mt-6 text-center text-xs text-zinc-600">
          {isCreating ? 'This creates the admin account for your paws instance.' : ''}
        </p>
      </div>
    </div>
  );
}
