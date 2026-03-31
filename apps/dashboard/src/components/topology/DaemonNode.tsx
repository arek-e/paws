import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type DaemonNodeData = {
  role: string;
  triggerType: string;
  status: string;
};

export type DaemonNodeType = Node<DaemonNodeData, 'daemon'>;

const DEFAULT_TRIGGER = {
  border: 'border-blue-400/50',
  badge: 'bg-blue-400/15 text-blue-400',
  text: 'webhook',
};

const triggerColors: Record<string, { border: string; badge: string; text: string }> = {
  webhook: {
    border: 'border-blue-400/50',
    badge: 'bg-blue-400/15 text-blue-400',
    text: 'webhook',
  },
  schedule: {
    border: 'border-purple-400/50',
    badge: 'bg-purple-400/15 text-purple-400',
    text: 'cron',
  },
  watch: {
    border: 'border-amber-400/50',
    badge: 'bg-amber-400/15 text-amber-400',
    text: 'watch',
  },
  github: {
    border: 'border-zinc-400/50',
    badge: 'bg-zinc-400/15 text-zinc-400',
    text: 'github',
  },
};

export function DaemonNode({ data }: NodeProps<DaemonNodeType>) {
  const colors = triggerColors[data.triggerType] ?? DEFAULT_TRIGGER;

  return (
    <div
      className={`px-3 py-2 rounded-full bg-zinc-800 border ${colors.border} min-w-[110px] text-center shadow-sm`}
    >
      <div className="flex items-center gap-1.5 justify-center">
        <span className="text-xs font-medium text-zinc-200 truncate max-w-[90px]">{data.role}</span>
        <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0.5', colors.badge)}>
          {colors.text}
        </Badge>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-zinc-600 !w-2 !h-2 !border-0"
      />
    </div>
  );
}
