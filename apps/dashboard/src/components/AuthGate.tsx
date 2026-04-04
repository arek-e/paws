import { useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { setSessionMode } from '../api/client.js';

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
          // If OIDC is available, skip local account creation — go straight to SSO
          if (data.oidcAvailable) {
            window.location.href = '/auth/login';
            return;
          }
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
            {isCreating ? 'Create your admin account' : 'Secure infrastructure for AI agents'}
          </p>
        </div>

        <form onSubmit={isCreating ? handleCreateAccount : handleLogin} className="space-y-3">
          <Input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            placeholder="Email"
            autoFocus
            className="h-10 bg-zinc-900 border-zinc-700 text-zinc-100 placeholder-zinc-500 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/50"
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            placeholder={isCreating ? 'Password (min 8 characters)' : 'Password'}
            className="h-10 bg-zinc-900 border-zinc-700 text-zinc-100 placeholder-zinc-500 focus-visible:border-emerald-400 focus-visible:ring-emerald-400/50"
          />
          {error && (
            <Alert variant="destructive" className="bg-red-400/10 border-red-400/20">
              <AlertDescription className="text-red-400">{error}</AlertDescription>
            </Alert>
          )}
          <Button
            type="submit"
            className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
          >
            {isCreating ? 'Create Account' : 'Login'}
          </Button>
        </form>

        {!isCreating && oidcAvailable && (
          <a
            href="/auth/login"
            className="mt-3 flex w-full items-center justify-center h-10 rounded-md border border-zinc-700 hover:border-zinc-600 text-zinc-300 text-sm transition-colors"
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
