import type { PawsClient } from '@paws/sdk';
import type { ParsedArgs } from '../config.js';
import { printError } from '../output.js';

const LOGS_HELP = `
Usage: paws logs <session-id> [options]

Fetch or stream logs from a session.

Options:
  --follow       Stream live output (poll until session completes)
  --interval <ms> Poll interval for --follow (default: 2000)

Examples:
  paws logs ses_abc123
  paws logs ses_abc123 --follow
`;

export async function logsCommand(
  client: PawsClient,
  args: ParsedArgs,
  _pretty: boolean,
): Promise<number> {
  if (args.flags['help'] !== undefined) {
    process.stdout.write(LOGS_HELP + '\n');
    return 0;
  }

  const sessionId = args.action;
  if (!sessionId) {
    printError('Session ID is required: paws logs <session-id>');
    return 1;
  }

  const follow = args.flags['follow'] !== undefined;
  const intervalMs = args.flags['interval'] ? Number(args.flags['interval']) : 2_000;

  if (follow) {
    return followLogs(client, sessionId, intervalMs);
  }

  return fetchLogs(client, sessionId);
}

async function fetchLogs(client: PawsClient, sessionId: string): Promise<number> {
  const result = await client.sessions.get(sessionId);

  if (result.isErr()) {
    printError(result.error.message);
    return 1;
  }

  const session = result.value;

  if (session.stdout) {
    process.stdout.write(session.stdout);
    // Ensure trailing newline
    if (!session.stdout.endsWith('\n')) {
      process.stdout.write('\n');
    }
  }

  if (session.stderr) {
    process.stderr.write(session.stderr);
    if (!session.stderr.endsWith('\n')) {
      process.stderr.write('\n');
    }
  }

  if (!session.stdout && !session.stderr) {
    process.stderr.write('(no output)\n');
  }

  return 0;
}

async function followLogs(
  client: PawsClient,
  sessionId: string,
  intervalMs: number,
): Promise<number> {
  const terminalStatuses = new Set(['completed', 'failed', 'timeout', 'cancelled']);
  let lastStdoutLen = 0;
  let lastStderrLen = 0;

  while (true) {
    const result = await client.sessions.get(sessionId);

    if (result.isErr()) {
      printError(result.error.message);
      return 1;
    }

    const session = result.value;

    // Print new stdout since last poll
    if (session.stdout && session.stdout.length > lastStdoutLen) {
      process.stdout.write(session.stdout.slice(lastStdoutLen));
      lastStdoutLen = session.stdout.length;
    }

    // Print new stderr since last poll
    if (session.stderr && session.stderr.length > lastStderrLen) {
      process.stderr.write(session.stderr.slice(lastStderrLen));
      lastStderrLen = session.stderr.length;
    }

    if (terminalStatuses.has(session.status)) {
      return session.exitCode ?? (session.status === 'completed' ? 0 : 1);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
