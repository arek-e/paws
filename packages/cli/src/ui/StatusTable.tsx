import { Box, Text } from 'ink';

interface StatusRow {
  label: string;
  value: string;
  color?: string;
}

export function StatusTable({ rows }: { rows: StatusRow[] }) {
  const maxLabel = Math.max(...rows.map((r) => r.label.length));

  return (
    <Box flexDirection="column">
      {rows.map((row, i) => (
        <Box key={i} gap={1}>
          <Text dimColor>{row.label.padEnd(maxLabel)}</Text>
          <Text {...(row.color != null && { color: row.color })}>{row.value}</Text>
        </Box>
      ))}
    </Box>
  );
}

interface WorkerRow {
  name: string;
  status: string;
  slots: string;
  uptime: string;
}

function workerStatusColor(status: string): string {
  switch (status) {
    case 'healthy':
      return 'green';
    case 'degraded':
      return 'yellow';
    case 'unreachable':
      return 'red';
    default:
      return 'gray';
  }
}

export function WorkerTable({ workers }: { workers: WorkerRow[] }) {
  const nameWidth = Math.max(4, ...workers.map((w) => w.name.length));
  const statusWidth = Math.max(6, ...workers.map((w) => w.status.length));
  const slotsWidth = Math.max(5, ...workers.map((w) => w.slots.length));

  return (
    <Box flexDirection="column">
      <Box gap={2}>
        <Text bold color="white">
          {'NAME'.padEnd(nameWidth)}
        </Text>
        <Text bold color="white">
          {'STATUS'.padEnd(statusWidth)}
        </Text>
        <Text bold color="white">
          {'SLOTS'.padEnd(slotsWidth)}
        </Text>
        <Text bold color="white">
          UPTIME
        </Text>
      </Box>
      {workers.map((w, i) => (
        <Box key={i} gap={2}>
          <Text>{w.name.padEnd(nameWidth)}</Text>
          <Text color={workerStatusColor(w.status)}>{w.status.padEnd(statusWidth)}</Text>
          <Text>{w.slots.padEnd(slotsWidth)}</Text>
          <Text dimColor>{w.uptime}</Text>
        </Box>
      ))}
    </Box>
  );
}

interface SessionRow {
  id: string;
  daemon: string;
  worker: string;
  age: string;
  status: string;
}

function sessionStatusColor(status: string): string {
  switch (status) {
    case 'running':
      return 'green';
    case 'pending':
      return 'yellow';
    default:
      return 'gray';
  }
}

export function SessionTable({ sessions }: { sessions: SessionRow[] }) {
  if (sessions.length === 0) {
    return <Text dimColor>No active sessions.</Text>;
  }

  const idWidth = Math.max(2, ...sessions.map((s) => s.id.length));
  const daemonWidth = Math.max(6, ...sessions.map((s) => s.daemon.length));
  const workerWidth = Math.max(6, ...sessions.map((s) => s.worker.length));
  const ageWidth = Math.max(3, ...sessions.map((s) => s.age.length));

  return (
    <Box flexDirection="column">
      <Box gap={2}>
        <Text bold color="white">
          {'ID'.padEnd(idWidth)}
        </Text>
        <Text bold color="white">
          {'DAEMON'.padEnd(daemonWidth)}
        </Text>
        <Text bold color="white">
          {'WORKER'.padEnd(workerWidth)}
        </Text>
        <Text bold color="white">
          {'AGE'.padEnd(ageWidth)}
        </Text>
        <Text bold color="white">
          STATUS
        </Text>
      </Box>
      {sessions.map((s, i) => (
        <Box key={i} gap={2}>
          <Text>{s.id.padEnd(idWidth)}</Text>
          <Text>{s.daemon.padEnd(daemonWidth)}</Text>
          <Text>{s.worker.padEnd(workerWidth)}</Text>
          <Text dimColor>{s.age.padEnd(ageWidth)}</Text>
          <Text color={sessionStatusColor(s.status)}>{s.status}</Text>
        </Box>
      ))}
    </Box>
  );
}
