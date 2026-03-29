import type { PawsClient, Session } from '@paws/sdk';
import type { ParsedArgs } from '../config.js';
import { formatOutput, printError } from '../output.js';

const SPINNER_FRAMES = ['-', '\\', '|', '/'];

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
    // Wrap prompt in a script that writes it to a file and executes the agent
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

  // Show spinner and poll for completion
  const isTTY = process.stderr.isTTY === true;

  if (isTTY) {
    process.stderr.write(`Session ${sessionId} created, waiting for completion...\n`);
  }

  const pollInterval = watch ? 2_000 : 1_000;
  const pollTimeout = timeout ?? 600_000;
  let lastStatus = '';
  let spinnerIdx = 0;

  const result = await pollSession(client, sessionId, pollInterval, pollTimeout, (session) => {
    if (!isTTY) return;

    if (session.status !== lastStatus) {
      clearSpinnerLine();
      process.stderr.write(`  ${session.status}\n`);
      lastStatus = session.status;
    }

    if (watch && session.stdout) {
      // In watch mode, stream stdout as it comes
      clearSpinnerLine();
      process.stdout.write(session.stdout);
    }

    // Show spinner
    const frame = SPINNER_FRAMES[spinnerIdx % SPINNER_FRAMES.length];
    spinnerIdx++;
    process.stderr.write(`\r  ${frame} ${session.status}...`);
  });

  if (isTTY) {
    clearSpinnerLine();
  }

  if (!result.ok) {
    printError(result.error);
    return 1;
  }

  const session = result.session;

  // Print final output
  if (pretty || isTTY) {
    printSessionResult(session);
  } else {
    process.stdout.write(formatOutput(session, false) + '\n');
  }

  // Exit with the session's exit code
  if (session.exitCode !== undefined && session.exitCode !== null) {
    return session.exitCode;
  }

  return session.status === 'completed' ? 0 : 1;
}

function clearSpinnerLine(): void {
  process.stderr.write('\r\x1b[K');
}

function printSessionResult(session: Session): void {
  const lines: string[] = [];

  lines.push('');
  const statusIcon =
    session.status === 'completed' ? '  done' : session.status === 'failed' ? '  fail' : '';
  lines.push(`Session: ${session.sessionId}`);
  lines.push(`Status:  ${session.status}${statusIcon}`);

  if (session.durationMs !== undefined) {
    lines.push(`Duration: ${formatDurationMs(session.durationMs)}`);
  }

  if (session.exitCode !== undefined && session.exitCode !== null) {
    lines.push(`Exit code: ${session.exitCode}`);
  }

  if (session.worker) {
    lines.push(`Worker: ${session.worker}`);
  }

  lines.push('');

  if (session.stdout) {
    lines.push('--- stdout ---');
    lines.push(session.stdout);
  }

  if (session.stderr) {
    lines.push('--- stderr ---');
    lines.push(session.stderr);
  }

  process.stdout.write(lines.join('\n') + '\n');
}

function formatDurationMs(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

type PollResult = { ok: true; session: Session } | { ok: false; error: string };

async function pollSession(
  client: PawsClient,
  sessionId: string,
  intervalMs: number,
  timeoutMs: number,
  onUpdate: (session: Session) => void,
): Promise<PollResult> {
  const deadline = Date.now() + timeoutMs;
  const terminalStatuses = new Set(['completed', 'failed', 'timeout', 'cancelled']);

  while (Date.now() < deadline) {
    const result = await client.sessions.get(sessionId);

    if (result.isErr()) {
      return { ok: false, error: result.error.message };
    }

    const session = result.value;
    onUpdate(session);

    if (terminalStatuses.has(session.status)) {
      return { ok: true, session };
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { ok: false, error: `Session ${sessionId} did not complete within ${timeoutMs}ms` };
}
