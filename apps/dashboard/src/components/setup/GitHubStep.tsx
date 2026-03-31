import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button.js';
import { Card, CardContent } from '@/components/ui/card.js';

interface GitHubStatus {
  connected: boolean;
  appSlug?: string;
  appId?: string;
  htmlUrl?: string;
}

export function GitHubStep() {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/setup/github/status', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setStatus(data as GitHubStatus))
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoading(false));
  }, []);

  async function startManifestFlow() {
    // Fetch the manifest from the server
    const res = await fetch('/setup/github/manifest', { credentials: 'include' });
    const manifest = await res.json();

    // Create a hidden form and submit it to GitHub
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://github.com/settings/apps/new';

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'manifest';
    input.value = JSON.stringify(manifest);
    form.appendChild(input);

    document.body.appendChild(form);
    form.submit();
  }

  if (loading) {
    return <div className="p-4 text-sm text-zinc-500">Checking GitHub connection...</div>;
  }

  if (status?.connected) {
    return (
      <Card className="border-emerald-700 bg-emerald-900/10 p-4 gap-0">
        <div className="flex items-center gap-3">
          <span className="text-xl">🐙</span>
          <div>
            <p className="text-sm font-medium text-zinc-200">GitHub App connected</p>
            <p className="text-xs text-emerald-400">
              ✓ {status.appSlug} (ID: {status.appId})
            </p>
          </div>
          {status.htmlUrl && (
            <a
              href={status.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs text-blue-400 hover:text-blue-300"
            >
              Settings
            </a>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-100 mb-1">Connect GitHub</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Create a GitHub App to trigger agents from PR comments. Type{' '}
        <code className="text-emerald-400">@paws review this PR</code> and an agent runs in an
        isolated VM.
      </p>

      <Card className="border-zinc-700 bg-zinc-900 p-4 gap-0 mb-4">
        <CardContent className="p-0">
          <p className="text-sm text-zinc-300 mb-3">This will:</p>
          <ul className="space-y-1.5 text-xs text-zinc-400">
            <li className="flex items-center gap-2">
              <span className="text-emerald-400">✓</span> Create a GitHub App on your account
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-400">✓</span> Set up webhook + permissions automatically
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-400">✓</span> Save credentials securely (never in code)
            </li>
          </ul>
        </CardContent>
      </Card>

      <Button
        variant="outline"
        onClick={startManifestFlow}
        className="w-full py-2.5 border-zinc-600"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
        </svg>
        Connect GitHub App
      </Button>

      <p className="text-xs text-zinc-600 mt-3 text-center">
        You'll be redirected to GitHub to authorize the app.
      </p>
    </div>
  );
}
