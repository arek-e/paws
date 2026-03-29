import { Text, Box } from 'ink';

export function Banner({ message }: { message?: string }) {
  return (
    <Box flexDirection="column">
      <Text color="green">{` /\\_/\\`}</Text>
      <Text color="green">{`( o.o )  ${message ?? 'paws'}`}</Text>
      <Text color="green">{` > ^ <`}</Text>
    </Box>
  );
}
