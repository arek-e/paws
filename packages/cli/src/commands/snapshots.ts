import type { PawsClient } from '@paws/sdk';
import type { ParsedArgs } from '../config.js';
import { formatOutput, printError } from '../output.js';

export async function snapshotsCommand(
  client: PawsClient,
  args: ParsedArgs,
  pretty: boolean,
): Promise<number> {
  switch (args.action) {
    case 'list':
      return snapshotsList(client, pretty);
    case 'build':
      return snapshotsBuild(client, args, pretty);
    default:
      printError(`Unknown snapshots action: ${args.action ?? '(none)'}. Available: list, build`);
      return 1;
  }
}

async function snapshotsList(client: PawsClient, pretty: boolean): Promise<number> {
  const result = await client.snapshots.list();

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

async function snapshotsBuild(
  client: PawsClient,
  args: ParsedArgs,
  pretty: boolean,
): Promise<number> {
  const id = args.positional;
  if (!id) {
    printError('Snapshot ID is required: paws snapshots build <id> --base <base> --setup <script>');
    return 1;
  }

  const base = args.flags['base'];
  const setup = args.flags['setup'];

  if (!base) {
    printError('--base is required');
    return 1;
  }
  if (!setup) {
    printError('--setup is required');
    return 1;
  }

  const result = await client.snapshots.build(id, {
    base,
    setup,
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
