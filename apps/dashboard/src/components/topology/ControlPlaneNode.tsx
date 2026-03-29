import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';

export type ControlPlaneNodeData = {
  activeDaemons: number;
  activeSessions: number;
  healthy: boolean;
};

export type ControlPlaneNodeType = Node<ControlPlaneNodeData, 'controlPlane'>;

export function ControlPlaneNode({ data }: NodeProps<ControlPlaneNodeType>) {
  return (
    <div className="relative px-6 py-4 rounded-lg bg-zinc-900 border-2 border-emerald-400 shadow-lg shadow-emerald-400/10 min-w-[200px]">
      <Handle type="target" position={Position.Top} className="!bg-zinc-600 !w-2 !h-2 !border-0" />

      <div className="flex items-center gap-3">
        <div className="text-lg">
          <pre className="text-emerald-400 text-[10px] leading-tight font-mono select-none">{` /\\_/\\
( o.o )
 > ^ <`}</pre>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-100">Control Plane</span>
            {data.healthy && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">
            {data.activeDaemons} daemon{data.activeDaemons !== 1 ? 's' : ''} &middot;{' '}
            {data.activeSessions} session{data.activeSessions !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-emerald-400 !w-2 !h-2 !border-0"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="daemon-target"
        className="!bg-zinc-600 !w-2 !h-2 !border-0"
      />
    </div>
  );
}
