import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';

export type WorkerNodeData = {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  running: number;
  maxConcurrent: number;
};

export type WorkerNodeType = Node<WorkerNodeData, 'worker'>;

export function WorkerNode({ data }: NodeProps<WorkerNodeType>) {
  const borderColor =
    data.status === 'healthy'
      ? 'border-emerald-400/40'
      : data.status === 'degraded'
        ? 'border-amber-400/40'
        : 'border-red-400/40';

  const statusColor =
    data.status === 'healthy'
      ? 'bg-emerald-400'
      : data.status === 'degraded'
        ? 'bg-amber-400'
        : 'bg-red-400';

  return (
    <div
      className={`px-4 py-3 rounded-lg bg-zinc-800 border ${borderColor} min-w-[160px] shadow-md`}
    >
      <Handle type="target" position={Position.Top} className="!bg-zinc-600 !w-2 !h-2 !border-0" />

      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2 h-2 rounded-full ${statusColor}`} />
        <span className="text-sm font-medium text-zinc-100 truncate">{data.name}</span>
      </div>
      <div className="text-xs text-zinc-500">
        {data.running}/{data.maxConcurrent} slots used
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-zinc-600 !w-2 !h-2 !border-0"
      />
    </div>
  );
}
