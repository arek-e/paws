import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';

export type ProxyNodeData = {
  domainCount: number;
};

export type ProxyNodeType = Node<ProxyNodeData, 'proxy'>;

export function ProxyNode({ data }: NodeProps<ProxyNodeType>) {
  return (
    <div className="px-2.5 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 min-w-[100px] shadow-sm">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-zinc-600 !w-1.5 !h-1.5 !border-0"
      />

      <div className="flex items-center gap-1.5">
        <svg
          className="w-3 h-3 text-zinc-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span className="text-[10px] text-zinc-400">TLS Proxy</span>
      </div>
      <div className="text-[9px] text-zinc-600 mt-0.5">
        {data.domainCount} domain{data.domainCount !== 1 ? 's' : ''}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-zinc-600 !w-1.5 !h-1.5 !border-0"
      />
    </div>
  );
}
