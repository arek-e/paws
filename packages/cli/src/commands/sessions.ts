import type { PawsClient } from '@paws/sdk';
import type { ParsedArgs } from '../config.js';
import { formatOutput, printError } from '../output.js';

export async function sessionsCommand(
  client: PawsClient,
  args: ParsedArgs,
  pretty: boolean,
): Promise<number> {
  switch (args.action) {
    case 'create':
      return sessionsCreate(client, args, pretty);
    case 'get':
      return sessionsGet(client, args, pretty);
    case 'cancel':
      return sessionsCancel(client, args, pretty);
    case 'wait':
      return sessionsWait(client, args, pretty);
    default:
      printError(
        `Unknown sessions action: ${args.action ?? '(none)'}. Available: create, get, cancel, wait`,
      );
      return 1;
  }
}

async function sessionsCreate(
  client: PawsClient,
  args: ParsedArgs,
  pretty: boolean,
): Promise<number> {
  const snapshot = args.flags['snapshot'];
  const script = args.flags['script'];

  if (!snapshot) {
    printError('--snapshot is required');
    return 1;
  }
  if (!script) {
    printError('--script is required');
    return 1;
  }

  const timeout = args.flags['timeout'] ? Number(args.flags['timeout']) : undefined;

  const result = await client.sessions.create({
    snapshot,
    workload: { type: 'script', script },
    ...(timeout !== undefined ? { timeoutMs: timeout } : {}),
  });

  return result.match(
    (data) => {
      process.stdout.write(formatOutput(data, pretty) + '\n');
      return 0;
    },
    (err) => {
      printError(err.message);
      return 1;
    },
  );
}

async function sessionsGet(client: PawsClient, args: ParsedArgs, pretty: boolean): Promise<number> {
  const id = args.positional;
  if (!id) {
    printError('Session ID is required: paws sessions get <id>');
    return 1;
  }

  const result = await client.sessions.get(id);

  return result.match(
    (data) => {
      process.stdout.write(formatOutput(data, pretty) + '\n');
      return 0;
    },
    (err) => {
      printError(err.message);
      return 1;
    },
  );
}

async function sessionsCancel(
  client: PawsClient,
  args: ParsedArgs,
  pretty: boolean,
): Promise<number> {
  const id = args.positional;
  if (!id) {
    printError('Session ID is required: paws sessions cancel <id>');
    return 1;
  }

  const result = await client.sessions.cancel(id);

  return result.match(
    (data) => {
      process.stdout.write(formatOutput(data, pretty) + '\n');
      return 0;
    },
    (err) => {
      printError(err.message);
      return 1;
    },
  );
}

async function sessionsWait(
  client: PawsClient,
  args: ParsedArgs,
  pretty: boolean,
): Promise<number> {
  const id = args.positional;
  if (!id) {
    printError('Session ID is required: paws sessions wait <id>');
    return 1;
  }

  const interval = args.flags['interval'] ? Number(args.flags['interval']) : undefined;
  const timeout = args.flags['timeout'] ? Number(args.flags['timeout']) : undefined;

  const result = await client.sessions.waitForCompletion(id, {
    ...(interval !== undefined ? { intervalMs: interval } : {}),
    ...(timeout !== undefined ? { timeoutMs: timeout } : {}),
  });

  return result.match(
    (data) => {
      process.stdout.write(formatOutput(data, pretty) + '\n');
      return 0;
    },
    (err) => {
      printError(err.message);
      return 1;
    },
  );
}
