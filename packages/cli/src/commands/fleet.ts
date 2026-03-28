import type { PawsClient } from '@paws/sdk';
import type { ParsedArgs } from '../config.js';
import { formatOutput, printError } from '../output.js';

export async function fleetCommand(
  client: PawsClient,
  args: ParsedArgs,
  pretty: boolean,
): Promise<number> {
  switch (args.action) {
    case 'status':
      return fleetStatus(client, pretty);
    case 'workers':
      return fleetWorkers(client, pretty);
    default:
      printError(`Unknown fleet action: ${args.action ?? '(none)'}. Available: status, workers`);
      return 1;
  }
}

async function fleetStatus(client: PawsClient, pretty: boolean): Promise<number> {
  const result = await client.fleet.overview();

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

async function fleetWorkers(client: PawsClient, pretty: boolean): Promise<number> {
  const result = await client.fleet.workers();

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
