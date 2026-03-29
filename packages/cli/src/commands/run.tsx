import { useState, useEffect, useCallback } from 'react';
import { render, Box, Text } from 'ink';
import { Spinner as InkSpinner } from '@inkjs/ui';
import type { PawsClient, Session } from '@paws/sdk';
import type { ParsedArgs } from '../config.js';
import { formatOutput, printError } from '../output.js';

const RUN_HELP = `
Usage: paws run [options]

Create a session and stream output in one step.

Options:
  --prompt <text>     Agent prompt (required unless --script is set)
  --script <file>     Script file to execute
  --snapshot <name>   Snapshot to use (required)
  --env <KEY=VAL>     Environment variable (can be repeated)
  --timeout <ms>      Session timeout in milliseconds (default: 600000)
  --vcpus <n>         vCPU count (1-8, default: 2)
  --memory <mb>       Memory in MB (256-16384, default: 4096)
  --no-wait           Just create the session and print the ID
  --watch             Poll for live output updates
  --pretty            Human-readable output

Examples:
  paws run --snapshot agent-latest --prompt "Review this PR"
  paws run --snapshot claude-code --script ./agent-script.sh
  paws run --snapshot agent-latest --prompt "Deploy" --env BRANCH=main --env DRY_RUN=true
  paws run --snapshot agent-latest --prompt "Build" --vcpus 4 --memory 8192
  paws run --snapshot agent-latest --prompt "Review" --no-wait
`;

// ---------------------------------------------------------------------------
// Ink component for interactive session watching
// ---------------------------------------------------------------------------

interface RunViewProps {
  client: PawsClient;
  sessionId: string;
  watch: boolean;
  pollInterval: number;
  pollTimeout: number;
  onDone: (code: number) => void;
}

function formatDurationMs(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatElapsed(startMs: number): string {
  return formatDurationMs(Date.now() - startMs);
}

function RunView({ client, sessionId, watch, pollInterval, pollTimeout, onDone }: RunViewProps) {
  const [status, setStatus] = useState<string>('pending');
  const [elapsed, setElapsed] = useState('0s');
  const [stdout, setStdout] = useState('');
  const [stderr, setStderr] = useState('');
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [durationMs, setDurationMs] = useState<number | undefined>(undefined);
  const [worker, setWorker] = useState<string | undefined>(undefined);
  const [startTime] = useState(() => Date.now());

  const terminalStatuses = new Set(['completed', 'failed', 'timeout', 'cancelled']);

  // Elapsed time ticker
  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => {
      setElapsed(formatElapsed(startTime));
    }, 1_000);
    return () => clearInterval(timer);
  }, [done, startTime]);

  // Polling loop
  useEffect(() => {
    let cancelled = false;
    const deadline = Date.now() + pollTimeout;

    const poll = async () => {
      while (!cancelled && Date.now() < deadline) {
        const result = await client.sessions.get(sessionId);

        if (cancelled) return;

        if (result.isErr()) {
          setError(result.error.message);
          setDone(true);
          onDone(1);
          return;
        }

        const session = result.value;
        setStatus(session.status);

        if (session.stdout) setStdout(session.stdout);
        if (session.stderr) setStderr(session.stderr);
        if (session.durationMs !== undefined) setDurationMs(session.durationMs);
        if (session.worker) setWorker(session.worker);
        if (session.exitCode !== undefined && session.exitCode !== null) {
          setExitCode(session.exitCode);
        }

        if (terminalStatuses.has(session.status)) {
          setDone(true);
          const code =
            session.exitCode !== undefined && session.exitCode !== null
              ? session.exitCode
              : session.status === 'completed'
                ? 0
                : 1;
          onDone(code);
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      if (!cancelled) {
        setError(`Session ${sessionId} did not complete within ${pollTimeout}ms`);
        setDone(true);
        onDone(1);
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [client, sessionId, pollInterval, pollTimeout]);

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">error: {error}</Text>
      </Box>
    );
  }

  const statusColor =
    status === 'completed'
      ? 'green'
      : status === 'failed' || status === 'timeout'
        ? 'red'
        : status === 'running'
          ? 'blue'
          : 'yellow';

  const statusIcon =
    status === 'completed' ? '\u2713' : status === 'failed' || status === 'timeout' ? '\u2717' : '';

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text dimColor>Session</Text>
        <Text>{sessionId}</Text>
      </Box>

      <Box gap={1}>
        <Text dimColor>Status</Text>
        {!done ? (
          <InkSpinner label={status} />
        ) : (
          <Text color={statusColor}>
            {statusIcon} {status}
          </Text>
        )}
      </Box>

      <Box gap={1}>
        <Text dimColor>Elapsed</Text>
        <Text>{done && durationMs !== undefined ? formatDurationMs(durationMs) : elapsed}</Text>
      </Box>

      {worker && (
        <Box gap={1}>
          <Text dimColor>Worker</Text>
          <Text>{worker}</Text>
        </Box>
      )}

      {done && exitCode !== null && (
        <Box gap={1}>
          <Text dimColor>Exit code</Text>
          <Text color={exitCode === 0 ? 'green' : 'red'}>{exitCode}</Text>
        </Box>
      )}

      {(watch || done) && stdout ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>--- stdout ---</Text>
          <Text>{stdout}</Text>
        </Box>
      ) : null}

      {(watch || done) && stderr ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>--- stderr ---</Text>
          <Text>{stderr}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Command entrypoint (same signature as before)
// ---------------------------------------------------------------------------

export async function runCommand(
  client: PawsClient,
  args: ParsedArgs,
  pretty: boolean,
): Promise<number> {
  if (args.flags['help'] !== undefined) {
    process.stdout.write(RUN_HELP + '\n');
    return 0;
  }

  const snapshot = args.flags['snapshot'];
  const prompt = args.flags['prompt'];
  const scriptPath = args.flags['script'];
  const noWait = args.flags['no-wait'] !== undefined;
  const watch = args.flags['watch'] !== undefined;
  const timeout = args.flags['timeout'] ? Number(args.flags['timeout']) : undefined;
  const vcpus = args.flags['vcpus'] ? Number(args.flags['vcpus']) : undefined;
  const memory = args.flags['memory'] ? Number(args.flags['memory']) : undefined;

  if (!snapshot) {
    printError('--snapshot is required');
    return 1;
  }

  if (!prompt && !scriptPath) {
    printError('Either --prompt or --script is required');
    return 1;
  }

  // Build the script from prompt or script file
  let script: string;
  if (scriptPath) {
    try {
      const fs = await import('node:fs');
      script = fs.readFileSync(scriptPath, 'utf-8');
    } catch (err) {
      printError(`Failed to read script file: ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
  } else {
    script = prompt!;
  }

  // Collect env vars from multi-flags
  const envVars: Record<string, string> = {};
  const envEntries = args.multiFlags?.['env'] ?? [];
  for (const entry of envEntries) {
    const eqIdx = entry.indexOf('=');
    if (eqIdx === -1) {
      printError(`Invalid --env format: ${entry}. Expected KEY=VALUE`);
      return 1;
    }
    envVars[entry.slice(0, eqIdx)] = entry.slice(eqIdx + 1);
  }

  // Build resources if specified
  const resources =
    vcpus !== undefined || memory !== undefined
      ? {
          ...(vcpus !== undefined ? { vcpus } : {}),
          ...(memory !== undefined ? { memoryMB: memory } : {}),
        }
      : undefined;

  // Create the session
  const createResult = await client.sessions.create({
    snapshot,
    workload: {
      type: 'script',
      script,
      ...(Object.keys(envVars).length > 0 ? { env: envVars } : {}),
    },
    ...(timeout !== undefined ? { timeoutMs: timeout } : {}),
    ...(resources !== undefined ? { resources } : {}),
  });

  if (createResult.isErr()) {
    printError(createResult.error.message);
    return 1;
  }

  const { sessionId } = createResult.value;

  // --no-wait: just print the session ID and exit
  if (noWait) {
    process.stdout.write(formatOutput({ sessionId, status: 'pending' }, pretty) + '\n');
    return 0;
  }

  // Non-TTY: fall back to plain polling (for piped/scripted usage)
  const isTTY = process.stderr.isTTY === true;
  if (!isTTY) {
    return plainPoll(client, sessionId, watch, timeout ?? 600_000, pretty);
  }

  // TTY: render Ink component
  const pollInterval = watch ? 2_000 : 1_000;
  const pollTimeout = timeout ?? 600_000;

  return new Promise<number>((resolve) => {
    const { unmount } = render(
      <RunView
        client={client}
        sessionId={sessionId}
        watch={watch}
        pollInterval={pollInterval}
        pollTimeout={pollTimeout}
        onDone={(code) => {
          // Small delay to let final render flush
          setTimeout(() => {
            unmount();
            resolve(code);
          }, 100);
        }}
      />,
    );
  });
}

// ---------------------------------------------------------------------------
// Plain-text fallback for non-TTY (preserves existing behavior for pipes)
// ---------------------------------------------------------------------------

async function plainPoll(
  client: PawsClient,
  sessionId: string,
  watch: boolean,
  timeoutMs: number,
  pretty: boolean,
): Promise<number> {
  const pollInterval = watch ? 2_000 : 1_000;
  const deadline = Date.now() + timeoutMs;
  const terminalStatuses = new Set(['completed', 'failed', 'timeout', 'cancelled']);

  while (Date.now() < deadline) {
    const result = await client.sessions.get(sessionId);

    if (result.isErr()) {
      printError(result.error.message);
      return 1;
    }

    const session = result.value;

    if (terminalStatuses.has(session.status)) {
      process.stdout.write(formatOutput(session, pretty) + '\n');
      if (session.exitCode !== undefined && session.exitCode !== null) {
        return session.exitCode;
      }
      return session.status === 'completed' ? 0 : 1;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  printError(`Session ${sessionId} did not complete within ${timeoutMs}ms`);
  return 1;
}
