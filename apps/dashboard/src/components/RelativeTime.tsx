import { useRelativeTime } from '@/hooks/useRelativeTime.js';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip.js';

interface RelativeTimeProps {
  timestamp: string | undefined;
  className?: string;
}

export function RelativeTime({ timestamp, className }: RelativeTimeProps) {
  const relative = useRelativeTime(timestamp);

  if (!timestamp) return <span className={className}>-</span>;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className={className} />}>{relative}</TooltipTrigger>
      <TooltipContent>{new Date(timestamp).toLocaleString()}</TooltipContent>
    </Tooltip>
  );
}
