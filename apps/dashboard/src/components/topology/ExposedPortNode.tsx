import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';

export type ExposedPortNodeData = {
  port: number;
  url: string;
  label?: string;
};

export type ExposedPortNodeType = Node<ExposedPortNodeData, 'exposedPort'>;

export function ExposedPortNode({ data }: NodeProps<ExposedPortNodeType>) {
  return (
    <div
      className="px-3 py-2 rounded-md bg-blue-950/50 border border-blue-500/30 min-w-[150px] cursor-pointer hover:border-blue-400/50 transition-colors shadow-sm"
      onClick={() => window.open(data.url, '_blank')}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-blue-400 !w-1.5 !h-1.5 !border-0"
      />

      <div className="flex items-center gap-2">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-blue-400 shrink-0"
        >
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-blue-300 truncate">
            {data.label ?? `Port ${data.port}`}
          </p>
          <p className="text-[9px] text-blue-400/60 truncate font-mono">{data.url}</p>
        </div>
      </div>
    </div>
  );
}
