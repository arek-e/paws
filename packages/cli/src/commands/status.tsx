import { render, Box, Text } from 'ink';
import type { PawsClient } from '@paws/sdk';
import type { Session } from '@paws/domain-session';
import type { FleetOverview, Worker, WorkerListResponse } from '@paws/domain-fleet';
import type { ParsedArgs } from '../config.js';
import { printError } from '../output.js';
import { Banner } from '../ui/Banner.js';
import { WorkerTable, SessionTable } from '../ui/StatusTable.js';

const VERSION = '0.5.0';

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

  const isTTY = process.stdout.isTTY === true;

  if (isTTY) {
    // Ink-based pretty output
    return new Promise<number>((resolve) => {
      const { unmount } = render(
        <StatusView fleet={fleet} workers={workers} activeSessions={activeSessions} />,
      );
      // Static render — unmount immediately after first paint
      setTimeout(() => {
        unmount();
        if (sessions === null) {
          process.stderr.write('note: session data unavailable\n');
        }
        resolve(0);
      }, 50);
    });
  }

  // Non-TTY pretty: fall back to text-based formatting
  const output = formatStatusOutput(fleet, workers, activeSessions);
  process.stdout.write(output + '\n');

  if (sessions === null) {
    process.stderr.write('note: session data unavailable\n');
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Ink component
// ---------------------------------------------------------------------------

interface StatusViewProps {
  fleet: FleetOverview;
  workers: WorkerListResponse;
  activeSessions: Session[] | null;
}

function StatusView({ fleet, workers, activeSessions }: StatusViewProps) {
  const workerList = workers.workers;

  const sessionCount = activeSessions?.length ?? fleet.activeSessions ?? 0;
  const workerCount = workerList.length;
  const unhealthyCount = workerList.filter((w: Worker) => w.status !== 'healthy').length;

  const workerWord = workerCount === 1 ? 'worker' : 'workers';
  const sessionWord = sessionCount === 1 ? 'session' : 'sessions';

  let summary = `${workerCount} ${workerWord}, ${sessionCount} active ${sessionWord}`;
  if (unhealthyCount > 0) {
    const uhWord = unhealthyCount === 1 ? 'worker' : 'workers';
    summary += ` (${unhealthyCount} ${uhWord} unreachable)`;
  }

  const workerNames = buildWorkerNames(workerList);

  const workerRows = workerList.map((w: Worker, i: number) => {
    const name = workerNames[i]!;
    const slots =
      w.status === 'healthy' || w.status === 'degraded'
        ? `${w.capacity.running}/${w.capacity.maxConcurrent}`
        : '---';
    const uptime = w.uptime > 0 ? formatDuration(w.uptime) : '---';
    return { name, status: w.status, slots, uptime };
  });

  const sessionRows = activeSessions
    ? activeSessions.map((s) => {
        const daemon = String((s.metadata as Record<string, unknown>)?.role ?? '---');
        const worker = s.worker ? findWorkerName(workerNames, workerList, s.worker) : '---';
        const age = s.startedAt
          ? formatDuration(Date.now() - new Date(s.startedAt).getTime())
          : '---';
        const id = s.sessionId.slice(0, 8);
        return { id, daemon, worker, age, status: s.status };
      })
    : [];

  return (
    <Box flexDirection="column">
      <Banner message={summary} />
      <Text> </Text>

      {workerCount === 0 ? (
        <Text dimColor>No workers in the fleet.</Text>
      ) : (
        <Box flexDirection="column">
          <Text bold>WORKERS</Text>
          <WorkerTable workers={workerRows} />
        </Box>
      )}

      <Text> </Text>

      {activeSessions === null ? (
        <Text dimColor>ACTIVE SESSIONS (unavailable)</Text>
      ) : (
        <Box flexDirection="column">
          <Text bold>ACTIVE SESSIONS</Text>
          <SessionTable sessions={sessionRows} />
        </Box>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Helpers (kept for non-TTY fallback & tests)
// ---------------------------------------------------------------------------

function buildWorkerNames(workers: Worker[]): string[] {
  return workers.map((_: Worker, i: number) => `worker-${String(i + 1).padStart(2, '0')}`);
}

function findWorkerName(workerNames: string[], workers: Worker[], workerUrl: string): string {
  const idx = workers.findIndex((w: Worker) => w.name === workerUrl);
  return idx >= 0 ? workerNames[idx]! : '---';
}

export function buildShortIds(sessions: Session[]): string[] {
  const shortIds = sessions.map((s) => s.sessionId.slice(0, 8));

  const counts = new Map<string, number>();
  for (const id of shortIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return sessions.map((s) => {
    const short = s.sessionId.slice(0, 8);
    if ((counts.get(short) ?? 0) > 1) {
      return s.sessionId.slice(0, 12);
    }
    return short;
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

export function formatStatusOutput(
  fleet: FleetOverview,
  workers: WorkerListResponse,
  activeSessions: Session[] | null,
): string {
  const workerList = workers.workers;
  const hasAlert =
    workerList.some((w: Worker) => w.status !== 'healthy') ||
    (fleet.totalCapacity > 0 && fleet.totalCapacity - fleet.usedCapacity === 0);

  const sessionCount = activeSessions?.length ?? fleet.activeSessions ?? 0;
  const workerCount = workerList.length;
  const unhealthyCount = workerList.filter((w: Worker) => w.status !== 'healthy').length;

  const workerWord = workerCount === 1 ? 'worker' : 'workers';
  const sessionWord = sessionCount === 1 ? 'session' : 'sessions';

  let summary = `${workerCount} ${workerWord}, ${sessionCount} active ${sessionWord}`;
  if (unhealthyCount > 0) {
    const uhWord = unhealthyCount === 1 ? 'worker' : 'workers';
    summary += ` (${unhealthyCount} ${uhWord} unreachable)`;
  }

  const CAT_HEALTHY = ` /\\_/\\   paws v${VERSION}\n( ^.^ )`;
  const CAT_ALERT = ` /\\_/\\   paws v${VERSION}\n( o.o )!`;
  const CAT_BOTTOM = ' > ^ <';

  const cat = hasAlert ? CAT_ALERT : CAT_HEALTHY;
  const lines: string[] = [];

  lines.push(`${cat}  ${summary}`);
  lines.push(CAT_BOTTOM);
  lines.push('');

  if (workerCount === 0) {
    lines.push('No workers in the fleet.');
    return lines.join('\n');
  }

  const workerNames = buildWorkerNames(workerList);
  lines.push('WORKERS');

  const workerRows = workerList.map((w: Worker, i: number) => {
    const name = workerNames[i]!;
    const slots =
      w.status === 'healthy' || w.status === 'degraded'
        ? `${w.capacity.running}/${w.capacity.maxConcurrent}`
        : '---';
    const uptime = w.uptime > 0 ? formatDuration(w.uptime) : '---';
    const status = w.status === 'healthy' ? 'healthy' : w.status;
    return { NAME: name, SLOTS: slots, STATUS: status, UPTIME: uptime };
  });

  lines.push(formatTable(workerRows, 2));
  lines.push('');

  if (activeSessions === null) {
    lines.push('ACTIVE SESSIONS (unavailable)');
  } else if (activeSessions.length === 0) {
    lines.push('No active sessions.');
  } else {
    lines.push('ACTIVE SESSIONS');
    const shortIds = buildShortIds(activeSessions);
    const sessionRows = activeSessions.map((s, i) => {
      const id = shortIds[i]!;
      const daemon = (s.metadata as Record<string, unknown>)?.role ?? '---';
      const worker = s.worker ? findWorkerName(workerNames, workerList, s.worker) : '---';
      const age = s.startedAt
        ? formatDuration(Date.now() - new Date(s.startedAt).getTime())
        : '---';
      return { ID: id, DAEMON: String(daemon), WORKER: worker, AGE: age, STATUS: s.status };
    });
    lines.push(formatTable(sessionRows, 2));
  }

  return lines.join('\n');
}
