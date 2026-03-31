import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import { usePolling } from '../hooks/usePolling.js';

interface VersionInfo {
  current: string;
  latest: string;
  updateAvailable: boolean;
  releaseUrl: string | null;
}

async function getVersion(): Promise<VersionInfo> {
  const res = await fetch('/v1/version');
  if (!res.ok) throw new Error('Failed to fetch version');
  return res.json();
}

export function UpdateBanner() {
  const version = usePolling(getVersion, 60_000);
  const [dismissed, setDismissed] = useState(false);

  if (!version.data?.updateAvailable || dismissed) return null;

  return (
    <Alert className="bg-emerald-400/10 border-emerald-400/20 mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <p className="text-sm text-emerald-400">
          paws v{version.data.latest} available
          <span className="text-zinc-500 ml-1">(you're on v{version.data.current})</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        {version.data.releaseUrl && (
          <a
            href={version.data.releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 text-xs text-emerald-400 hover:bg-emerald-400/10 rounded transition-colors"
          >
            Changelog
          </a>
        )}
        <code className="text-xs text-zinc-400 bg-zinc-800 px-2 py-1 rounded font-mono">
          paws update
        </code>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDismissed(true)}
          className="text-zinc-600 hover:text-zinc-400 ml-2 size-7"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M1 1l12 12M13 1L1 13" />
          </svg>
        </Button>
      </div>
    </Alert>
  );
}

export function VersionBadge() {
  const version = usePolling(getVersion, 60_000);

  if (!version.data) return null;

  return (
    <div className="flex items-center gap-1.5">
      <p className="text-xs text-zinc-700">v{version.data.current}</p>
      {version.data.updateAvailable && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-emerald-400"
          title={`v${version.data.latest} available`}
        />
      )}
    </div>
  );
}
