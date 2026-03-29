#!/usr/bin/env bun

import type { PawsClient } from '@paws/sdk';
import { createClient } from '@paws/sdk';

import type { ParsedArgs } from './config.js';
import { parseArgs, resolveConfig } from './config.js';
import { daemonsCommand } from './commands/daemons.js';
import { fleetCommand } from './commands/fleet.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { logsCommand } from './commands/logs.js';
import { runCommand } from './commands/run.js';
import { serversCommand } from './commands/servers.js';
import { sessionsCommand } from './commands/sessions.js';
import { snapshotsCommand } from './commands/snapshots.js';
import { statusCommand } from './commands/status.js';
import { printError } from './output.js';

const VERSION = '0.1.0';

const HELP = `
 /\\_/\\
( o.o )  paws CLI v${VERSION}
 > ^ <   zero-trust credential injection for AI agents

Usage: paws [options] <resource> <action> [args]

Commands:
  run         create a session and stream output (hero command)
  logs        fetch or stream logs from a session
  login       authenticate via OAuth (opens browser)
  logout      clear stored credentials

Resources:
  status      fleet overview with workers and active sessions
  servers     list, add, add-ec2, test, remove
  sessions    create, get, cancel, wait
  daemons     list, create, get, delete
  fleet       status, workers
  snapshots   list, build

Global options:
  --url <url>       Gateway URL (or PAWS_URL env var)
  --api-key <key>   API key (or PAWS_API_KEY env var)
  --pretty          Human-readable output (default: JSON)
  --help            Show this help
  --version         Show version

Examples:
  paws run --snapshot agent-latest --prompt "Review this PR"
  paws run --snapshot claude-code --script ./agent-script.sh --no-wait
  paws logs ses_abc123 --follow
  paws sessions create --snapshot agent-latest --script "echo hello"
  paws sessions get ses_abc123
  paws fleet status --pretty
  paws daemons list
`;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (
    args.flags['help'] !== undefined ||
    (!args.resource && Object.keys(args.flags).length === 0)
  ) {
    process.stdout.write(HELP + '\n');
    return 0;
  }

  if (args.flags['version'] !== undefined) {
    process.stdout.write(`paws v${VERSION}\n`);
    return 0;
  }

  const pretty = args.flags['pretty'] !== undefined;

  // Commands that don't require authentication
  if (args.resource === 'login') {
    return loginCommand(null, args, pretty);
  }
  if (args.resource === 'logout') {
    return logoutCommand();
  }

  let config;
  try {
    config = await resolveConfig({ flags: args.flags, env: process.env });
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const client = createClient({ baseUrl: config.url, apiKey: config.apiKey });

  type CommandHandler = (client: PawsClient, args: ParsedArgs, pretty: boolean) => Promise<number>;
  const dispatch: Record<string, CommandHandler> = {
    run: runCommand,
    logs: logsCommand,
    status: statusCommand,
    sessions: sessionsCommand,
    daemons: daemonsCommand,
    fleet: fleetCommand,
    servers: serversCommand,
    snapshots: snapshotsCommand,
  };

  const handler = args.resource ? dispatch[args.resource] : undefined;
  if (!handler) {
    printError(
      `Unknown resource: ${args.resource ?? '(none)'}. Available: login, logout, sessions, daemons, fleet, snapshots`,
    );
    return 1;
  }

  return handler(client, args, pretty);
}

main().then((code) => {
  process.exit(code);
});
