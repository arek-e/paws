import { Spinner as InkSpinner } from '@inkjs/ui';

export function Spinner({ label }: { label: string }) {
  return <InkSpinner label={label} />;
}
