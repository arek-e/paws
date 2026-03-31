import { useMemo } from 'react';
import { Link, useParams } from '@tanstack/react-router';

import { getSession } from '../api/client.js';
import { BrowserView } from '../components/BrowserView.js';
import { Copyable } from '../components/CopyButton.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Terminal } from '../components/Terminal.js';
import { Alert, AlertDescription } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../components/ui/breadcrumb.js';
import { Card, CardContent } from '../components/ui/card.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { usePolling } from '../hooks/usePolling.js';
import { useWebSocket } from '../hooks/useWebSocket.js';

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimestamp(ts: string | undefined): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString();
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'timeout', 'cancelled']);

export function SessionDetail() {
  const { id } = useParams({ strict: false }) as { id: string };

  const session = usePolling(() => getSession(id), 3000);

  const isTerminal = session.data ? TERMINAL_STATUSES.has(session.data.status) : false;

  // WebSocket for live streaming (only when not terminal)
  const apiKey = typeof window !== 'undefined' ? (localStorage.getItem('paws_api_key') ?? '') : '';
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl =
    !isTerminal && id
      ? `${wsProtocol}//${window.location.host}/v1/sessions/${id}/stream?token=${encodeURIComponent(apiKey)}`
      : null;
  const ws = useWebSocket(wsUrl);

  // Merge terminal lines from session data + websocket messages
  const terminalLines = useMemo(() => {
    const lines: { stream: 'stdout' | 'stderr'; text: string }[] = [];

    // From completed session data
    if (session.data?.stdout) {
      for (const line of session.data.stdout.split('\n')) {
        lines.push({ stream: 'stdout', text: line });
      }
    }
    if (session.data?.stderr) {
      for (const line of session.data.stderr.split('\n')) {
        lines.push({ stream: 'stderr', text: line });
      }
    }

    // From live websocket
    if (!isTerminal) {
      for (const msg of ws.messages) {
        if (msg.type === 'output') {
          lines.push({ stream: msg.stream, text: msg.data });
        }
      }
    }

    return lines;
  }, [session.data?.stdout, session.data?.stderr, ws.messages, isTerminal]);

  if (!id) return <p className="text-zinc-400">No session ID provided.</p>;

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/" />}>Topology</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/sessions" />}>Sessions</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              <Copyable value={id}>
                <span className="font-mono">{id}</span>
              </Copyable>
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {session.loading && !session.data ? (
        <Skeleton className="h-32" />
      ) : session.error ? (
        <Alert variant="destructive" className="bg-red-400/10 border-red-400/20 text-red-400">
          <AlertDescription>Failed to load session: {session.error.message}</AlertDescription>
        </Alert>
      ) : session.data ? (
        <>
          <Card className="bg-zinc-900 border-zinc-800 py-0 shadow-none">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-zinc-500 text-xs">Status</p>
                  <div className="mt-1">
                    <StatusBadge status={session.data.status} />
                  </div>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Worker</p>
                  <p className="mt-1 text-zinc-300">{session.data.worker ?? '-'}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Duration</p>
                  <p className="mt-1 text-zinc-300">{formatDuration(session.data.durationMs)}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Started</p>
                  <p className="mt-1 text-zinc-300">{formatTimestamp(session.data.startedAt)}</p>
                </div>
                {session.data.exitCode !== undefined && (
                  <div>
                    <p className="text-zinc-500 text-xs">Exit Code</p>
                    <p
                      className={`mt-1 ${session.data.exitCode === 0 ? 'text-emerald-400' : 'text-red-400'}`}
                    >
                      {session.data.exitCode}
                    </p>
                  </div>
                )}
                {session.data.completedAt && (
                  <div>
                    <p className="text-zinc-500 text-xs">Completed</p>
                    <p className="mt-1 text-zinc-300">
                      {formatTimestamp(session.data.completedAt)}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {session.data.exposedPorts && session.data.exposedPorts.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                Exposed Ports
              </h2>
              <Card className="bg-zinc-900 border-zinc-800 py-0 shadow-none">
                <CardContent className="p-3 space-y-3">
                  {session.data.exposedPorts.map((ep) => (
                    <div key={ep.port} className="space-y-1">
                      <div className="flex items-center gap-3 text-sm">
                        <Badge
                          variant="outline"
                          className="font-mono bg-zinc-800 text-zinc-300 border-zinc-700 rounded"
                        >
                          :{ep.port}
                        </Badge>
                        {ep.label && <span className="text-zinc-500 text-xs">{ep.label}</span>}
                        {'access' in ep && (ep as { access?: string }).access && (
                          <Badge
                            variant="outline"
                            className={`rounded ${
                              (ep as { access?: string }).access === 'sso'
                                ? 'bg-blue-400/10 text-blue-400 border-blue-400/20'
                                : (ep as { access?: string }).access === 'pin'
                                  ? 'bg-amber-400/10 text-amber-400 border-amber-400/20'
                                  : 'bg-purple-400/10 text-purple-400 border-purple-400/20'
                            }`}
                          >
                            {(ep as { access?: string }).access}
                          </Badge>
                        )}
                        <a
                          href={ep.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 font-mono text-xs"
                        >
                          {ep.url}
                        </a>
                      </div>
                      {'pin' in ep && (ep as { pin?: string }).pin && (
                        <div className="flex items-center gap-2 ml-8">
                          <span className="text-xs text-zinc-500">PIN:</span>
                          <code className="text-xs text-amber-400 bg-zinc-800 px-2 py-0.5 rounded font-mono">
                            {(ep as { pin?: string }).pin}
                          </code>
                        </div>
                      )}
                      {'shareLink' in ep && (ep as { shareLink?: string }).shareLink && (
                        <div className="flex items-center gap-2 ml-8">
                          <span className="text-xs text-zinc-500">Share:</span>
                          <a
                            href={(ep as { shareLink?: string }).shareLink!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-zinc-400 hover:text-zinc-300 underline underline-offset-2 font-mono truncate max-w-md"
                          >
                            {(ep as { shareLink?: string }).shareLink}
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {session.data.browser?.enabled && (
            <BrowserView
              sessionId={id!}
              width={session.data.browser.width ?? 1280}
              height={session.data.browser.height ?? 720}
              active={!isTerminal}
            />
          )}

          <div>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
                Output
              </h2>
              {!isTerminal && (
                <Badge
                  variant="outline"
                  className={`gap-1 rounded-full ${ws.connected ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${ws.connected ? 'bg-emerald-400' : 'bg-zinc-600'}`}
                  />
                  {ws.connected ? 'live' : 'disconnected'}
                </Badge>
              )}
            </div>
            <Terminal lines={terminalLines} />
          </div>
        </>
      ) : null}
    </div>
  );
}
