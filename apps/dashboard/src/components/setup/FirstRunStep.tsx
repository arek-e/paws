import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Label } from '@/components/ui/label.js';
import { Textarea } from '@/components/ui/textarea.js';

import { Terminal } from '../Terminal.js';

interface TerminalLine {
  stream: 'stdout' | 'stderr';
  text: string;
}

interface FirstRunStepProps {
  onComplete: () => void;
  onBack: () => void;
}

type RunStatus = 'idle' | 'running' | 'complete' | 'error';

const DEFAULT_PROMPT = `List the top 5 trending GitHub repos today and summarize each in one sentence. Write the results to /output/result.json.`;

export function FirstRunStep({ onComplete, onBack }: FirstRunStepProps) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAgent() {
    setStatus('running');
    setError(null);
    setLines([]);
    setResult(null);

    try {
      const res = await fetch('/v1/setup/first-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message ?? `Failed: ${res.status}`);
      }

      const { sessionId } = (await res.json()) as { sessionId: string };

      // Connect to session stream
      const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/v1/sessions/${sessionId}/stream`;
      const ws = new WebSocket(wsUrl);

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);

          if (data.type === 'output') {
            setLines((prev) => [...prev, { stream: data.stream ?? 'stdout', text: data.text }]);
          }

          if (data.type === 'status') {
            if (data.status === 'running') {
              setLines((prev) => [
                ...prev,
                { stream: 'stdout', text: `Session ${sessionId.slice(0, 8)}... running` },
              ]);
            }
          }

          if (data.type === 'complete') {
            setStatus('complete');
            if (data.output) {
              setResult(JSON.stringify(data.output, null, 2));
            }
            setLines((prev) => [
              ...prev,
              {
                stream: 'stdout',
                text: `✓ Completed in ${data.durationMs ? Math.round(data.durationMs / 1000) + 's' : 'unknown'}`,
              },
            ]);
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        // Poll via HTTP as fallback
        const poll = setInterval(async () => {
          try {
            const sRes = await fetch(`/v1/sessions/${sessionId}`, { credentials: 'include' });
            if (!sRes.ok) return;
            const session = await sRes.json();
            if (session.status === 'completed' || session.status === 'failed') {
              clearInterval(poll);
              if (session.status === 'completed') {
                setStatus('complete');
                if (session.output) setResult(JSON.stringify(session.output, null, 2));
              } else {
                setStatus('error');
                setError(session.stderr ?? 'Agent failed');
              }
            }
          } catch {
            // ignore
          }
        }, 3000);
      };
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to start agent');
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-100 mb-1">Run your first agent</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Let's see it work. This will start a Firecracker VM and run a task.
      </p>

      {status === 'idle' && (
        <>
          <div>
            <Label className="text-xs text-zinc-400 mb-1">Prompt</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="bg-zinc-900 border-zinc-700 text-zinc-100 font-mono resize-none"
            />
          </div>

          <div className="flex justify-center mt-5">
            <Button
              onClick={runAgent}
              disabled={!prompt}
              className="px-8 bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              ▶ Run Agent
            </Button>
          </div>
        </>
      )}

      {status !== 'idle' && (
        <>
          <Terminal lines={lines} title={`session`} />

          {result && (
            <div className="mt-4">
              <p className="text-xs text-zinc-400 mb-1 font-medium">result.json</p>
              <pre className="p-3 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-300 font-mono overflow-auto max-h-40">
                {result}
              </pre>
            </div>
          )}

          {error && (
            <Alert variant="destructive" className="mt-4 bg-red-900/20 border-red-800">
              <AlertDescription>
                <p className="text-sm text-red-400">{error}</p>
                <button
                  onClick={() => {
                    setStatus('idle');
                    setError(null);
                    setLines([]);
                  }}
                  className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
                >
                  Try Again
                </button>
              </AlertDescription>
            </Alert>
          )}
        </>
      )}

      <div className="flex justify-between mt-6">
        <Button variant="ghost" onClick={onBack} className="text-zinc-400 hover:text-zinc-200">
          ← Back
        </Button>
        {status === 'complete' && (
          <Button onClick={onComplete} className="bg-emerald-600 hover:bg-emerald-500 text-white">
            Go to Dashboard →
          </Button>
        )}
      </div>
    </div>
  );
}
