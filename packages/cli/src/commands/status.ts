import type { PawsClient } from '@paws/sdk';
import type { FleetOverview, Session, Worker, WorkerListResponse } from '@paws/types';
import type { ParsedArgs } from '../config.js';
import { printError } from '../output.js';

const VERSION = '0.5.0';

const CAT_HEALTHY = ` /\\_/\\   paws v${VERSION}\n( ^.^ )`;
const CAT_ALERT = ` /\\_/\\   paws v${VERSION}\n( o.o )!`;
const CAT_BOTTOM = ' > ^ <';

export async function statusCommand(
  client: PawsClient,
  args: ParsedArgs,
  _pretty: boolean,
): Promise<number> {
  const json = args.flags['json'] !== undefined;
  const forcePretty = args.flags['pretty'] !== undefined;
  const usePretty = forcePretty || (!json && process.stdout.isTTY === true);

  const [fleetResult, workersResult, sessionsResult] = await Promise.all([
    client.fleet.overview(),
    client.fleet.workers(),
    client.sessions.list(),
  ]);

  if (fleetResult.isErr()) {
    printError(fleetResult.error.message);
    return 1;
  }
  if (workersResult.isErr()) {
    printError(workersResult.error.message);
    return 1;
  }

  const fleet = fleetResult.value;
  const workers = workersResult.value;
  const sessions = sessionsResult.isOk() ? sessionsResult.value : null;

  if (!usePretty) {
    process.stdout.write(JSON.stringify({ fleet, workers, sessions }, null, 2) + '\n');
    return 0;
  }

  const activeSessions = sessions
    ? sessions.sessions.filter((s) => s.status === 'running' || s.status === 'pending')
    : null;

  const output = formatStatusOutput(fleet, workers, activeSessions);
  process.stdout.write(output + '\n');

  if (sessions === null) {
    process.stderr.write('note: session data unavailable\n');
  }

  return 0;
}

export function formatStatusOutput(
  fleet: FleetOverview,
  workers: WorkerListResponse,
  activeSessions: Session[] | null,
): string {
  const workerList = workers.workers;
  const hasAlert =
    workerList.some((w: Worker) => w.status !== 'healthy') ||
    (fleet.totalCapacity > 0 && fleet.totalCapacity - fleet.usedCapacity === 0);

  const kittenCount = activeSessions?.length ?? fleet.activeSessions ?? 0;
  const treeCount = workerList.length;
  const unhealthyCount = workerList.filter((w: Worker) => w.status !== 'healthy').length;

  const treeWord = treeCount === 1 ? 'tree' : 'trees';
  const kittenWord = kittenCount === 1 ? 'kitten' : 'kittens';

  let summary = `${treeCount} ${treeWord}, ${kittenCount} ${kittenWord} active`;
  if (unhealthyCount > 0) {
    const uhWord = unhealthyCount === 1 ? 'tree' : 'trees';
    summary += ` (${unhealthyCount} ${uhWord} unreachable)`;
  }

  const cat = hasAlert ? CAT_ALERT : CAT_HEALTHY;
  const lines: string[] = [];

  lines.push(`${cat}  ${summary}`);
  lines.push(CAT_BOTTOM);
  lines.push('');

  if (treeCount === 0) {
    lines.push('No trees in the fleet.');
    return lines.join('\n');
  }

  // Trees table
  const treeNames = buildTreeNames(workerList);
  lines.push('TREES');

  const treeRows = workerList.map((w: Worker, i: number) => {
    const name = treeNames[i]!;
    const boxes =
      w.status === 'healthy' || w.status === 'degraded'
        ? `${w.capacity.running}/${w.capacity.maxConcurrent}`
        : '---';
    const uptime = w.uptime > 0 ? formatDuration(w.uptime) : '---';
    const status = w.status === 'healthy' ? 'healthy' : w.status;
    return { NAME: name, BOXES: boxes, STATUS: status, UPTIME: uptime };
  });

  lines.push(formatTable(treeRows, 2));
  lines.push('');

  // Active kittens table
  if (activeSessions === null) {
    lines.push('ACTIVE KITTENS (unavailable)');
  } else if (activeSessions.length === 0) {
    lines.push('No active kittens.');
  } else {
    lines.push('ACTIVE KITTENS');
    const boxIds = buildBoxIds(activeSessions);
    const kittenRows = activeSessions.map((s, i) => {
      const id = boxIds[i]!;
      const daemon = (s.metadata as Record<string, unknown>)?.role ?? '---';
      const tree = s.worker ? findTreeName(treeNames, workerList, s.worker) : '---';
      const age = s.startedAt
        ? formatDuration(Date.now() - new Date(s.startedAt).getTime())
        : '---';
      return { ID: id, DAEMON: String(daemon), TREE: tree, AGE: age, STATUS: s.status };
    });
    lines.push(formatTable(kittenRows, 2));
  }

  return lines.join('\n');
}

function buildTreeNames(workers: Worker[]): string[] {
  return workers.map((_: Worker, i: number) => `tree-${String(i + 1).padStart(2, '0')}`);
}

function findTreeName(treeNames: string[], workers: Worker[], workerName: string): string {
  const idx = workers.findIndex((w: Worker) => w.name === workerName);
  return idx >= 0 ? treeNames[idx]! : '---';
}

export function buildBoxIds(sessions: Session[]): string[] {
  const shortIds = sessions.map((s) => s.sessionId.slice(0, 4));

  // Detect collisions and extend to 6 chars
  const counts = new Map<string, number>();
  for (const id of shortIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return sessions.map((s) => {
    const short = s.sessionId.slice(0, 4);
    const prefix = 'box-';
    if ((counts.get(short) ?? 0) > 1) {
      return prefix + s.sessionId.slice(0, 6);
    }
    return prefix + short;
  });
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatTable(rows: Record<string, string>[], indent: number): string {
  if (rows.length === 0) return '';
  const keys = Object.keys(rows[0]!);
  const widths = keys.map((k) => Math.max(k.length, ...rows.map((r) => (r[k] ?? '').length)));
  const pad = ' '.repeat(indent);
  const header = pad + keys.map((k, i) => k.padEnd(widths[i]!)).join('  ');
  const body = rows
    .map((row) => pad + keys.map((k, i) => (row[k] ?? '').padEnd(widths[i]!)).join('  '))
    .join('\n');
  return `${header}\n${body}`;
}
