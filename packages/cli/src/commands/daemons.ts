import type { PawsClient } from '@paws/sdk';
import type { ParsedArgs } from '../config.js';
import { formatOutput, printError } from '../output.js';

export async function daemonsCommand(
  client: PawsClient,
  args: ParsedArgs,
  pretty: boolean,
): Promise<number> {
  switch (args.action) {
    case 'list':
      return daemonsList(client, pretty);
    case 'create':
      return daemonsCreate(client, args, pretty);
    case 'get':
      return daemonsGet(client, args, pretty);
    case 'delete':
      return daemonsDelete(client, args, pretty);
    default:
      printError(
        `Unknown daemons action: ${args.action ?? '(none)'}. Available: list, create, get, delete`,
      );
      return 1;
  }
}

async function daemonsList(client: PawsClient, pretty: boolean): Promise<number> {
  const result = await client.daemons.list();

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

async function daemonsCreate(
  client: PawsClient,
  args: ParsedArgs,
  pretty: boolean,
): Promise<number> {
  const role = args.flags['role'];
  const snapshot = args.flags['snapshot'];
  const triggerType = args.flags['trigger-type'];
  const events = args.flags['events'];
  const script = args.flags['script'];

  if (!role) {
    printError('--role is required');
    return 1;
  }
  if (!snapshot) {
    printError('--snapshot is required');
    return 1;
  }
  if (!triggerType) {
    printError('--trigger-type is required');
    return 1;
  }
  if (!script) {
    printError('--script is required');
    return 1;
  }

  let trigger:
    | { type: 'webhook'; events: string[] }
    | { type: 'schedule'; cron: string }
    | { type: 'watch'; condition: string };
  switch (triggerType) {
    case 'webhook': {
      if (!events) {
        printError('--events is required for webhook triggers');
        return 1;
      }
      trigger = { type: 'webhook', events: events.split(',') };
      break;
    }
    case 'schedule': {
      const cron = args.flags['cron'];
      if (!cron) {
        printError('--cron is required for schedule triggers');
        return 1;
      }
      trigger = { type: 'schedule', cron };
      break;
    }
    case 'watch': {
      const condition = args.flags['condition'];
      if (!condition) {
        printError('--condition is required for watch triggers');
        return 1;
      }
      trigger = { type: 'watch', condition };
      break;
    }
    default:
      printError(`Unknown trigger type: ${triggerType}. Available: webhook, schedule, watch`);
      return 1;
  }

  const result = await client.daemons.create({
    role,
    snapshot,
    trigger,
    workload: { type: 'script', script },
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

async function daemonsGet(client: PawsClient, args: ParsedArgs, pretty: boolean): Promise<number> {
  const role = args.positional;
  if (!role) {
    printError('Daemon role is required: paws daemons get <role>');
    return 1;
  }

  const result = await client.daemons.get(role);

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

async function daemonsDelete(
  client: PawsClient,
  args: ParsedArgs,
  pretty: boolean,
): Promise<number> {
  const role = args.positional;
  if (!role) {
    printError('Daemon role is required: paws daemons delete <role>');
    return 1;
  }

  const result = await client.daemons.delete(role);

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
