import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';

export type ExternalNodeData = {
  domain: string;
};

export type ExternalNodeType = Node<ExternalNodeData, 'external'>;

export function ExternalNode({ data }: NodeProps<ExternalNodeType>) {
  return (
    <div className="px-3 py-2 rounded-md bg-zinc-700/50 border border-dashed border-zinc-600 min-w-[120px] text-center shadow-sm">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-zinc-600 !w-1.5 !h-1.5 !border-0"
      />

      <span className="text-xs text-zinc-400 font-mono">{data.domain}</span>
    </div>
  );
}
