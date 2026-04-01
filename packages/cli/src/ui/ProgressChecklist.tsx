import { Box, Text } from 'ink';

export interface Step {
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

function statusIcon(status: Step['status']): string {
  switch (status) {
    case 'done':
      return '\u2713';
    case 'error':
      return '\u2717';
    case 'active':
      return '\u27F3';
    case 'pending':
      return '\u25CB';
  }
}

function statusColor(status: Step['status']): string {
  switch (status) {
    case 'done':
      return 'green';
    case 'error':
      return 'red';
    case 'active':
      return 'blue';
    case 'pending':
      return 'gray';
  }
}

export function ProgressChecklist({ steps }: { steps: Step[] }) {
  return (
    <Box flexDirection="column">
      {steps.map((step, i) => (
        <Box key={i} gap={1}>
          <Text color={statusColor(step.status)}>{statusIcon(step.status)}</Text>
          <Text {...(step.status === 'pending' && { color: 'gray' as const })}>{step.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
