import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { getDaemons, getFleet, getSessions, getWorkers } from '../api/client.js';
import { usePolling } from '../hooks/usePolling.js';
import { useTopologyLayout } from '../components/topology/useTopologyLayout.js';
import { ControlPlaneNode } from '../components/topology/ControlPlaneNode.js';
import { WorkerNode } from '../components/topology/WorkerNode.js';
import { SessionNode } from '../components/topology/SessionNode.js';
import { ProxyNode } from '../components/topology/ProxyNode.js';
import { DaemonNode } from '../components/topology/DaemonNode.js';
import { ExternalNode } from '../components/topology/ExternalNode.js';
import type { FleetOverview, Worker, Session } from '@paws/types';
import { useEffect } from 'react';

const nodeTypes: NodeTypes = {
  controlPlane: ControlPlaneNode,
  worker: WorkerNode,
  session: SessionNode,
  proxy: ProxyNode,
  daemon: DaemonNode,
  external: ExternalNode,
};

interface DaemonItem {
  role: string;
  trigger: { type: string };
  status: string;
}

function TopologyCanvas() {
  const fleet = usePolling(getFleet, 3000);
  const workersResult = usePolling(getWorkers, 3000);
  const sessionsResult = usePolling(getSessions, 3000);
  const daemonsResult = usePolling(getDaemons, 10000);

  const workers: Worker[] = workersResult.data?.workers ?? [];
  const sessions: Session[] = sessionsResult.data?.sessions ?? [];
  const daemons: DaemonItem[] = (daemonsResult.data?.daemons ?? []) as DaemonItem[];

  const layoutInput = useMemo(
    () => ({
      fleet: fleet.data as FleetOverview | null,
      workers,
      sessions,
      daemons,
    }),
    [fleet.data, workers, sessions, daemons],
  );

  const { nodes: layoutNodes, edges: layoutEdges } = useTopologyLayout(layoutInput);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);
  const { fitView } = useReactFlow();

  // Update nodes/edges when layout changes from new data
  useEffect(() => {
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [layoutNodes, layoutEdges, setNodes, setEdges]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 });
  }, [fitView]);

  const isEmpty = workers.length === 0 && sessions.length === 0 && daemons.length === 0;
  const isLoading = fleet.loading && workersResult.loading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-zinc-500">Loading topology...</p>
        </div>
      </div>
    );
  }

  if (isEmpty && !fleet.data) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950">
        <div className="text-center">
          <pre className="text-zinc-600 text-sm font-mono mb-3">
            {`  /\\_/\\
 ( -.- ) zzZ
  > ^ <`}
          </pre>
          <p className="text-zinc-500 text-sm">No agents running.</p>
          <p className="text-zinc-600 text-xs mt-1">Create a daemon to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      {/* Fit View button */}
      <button
        onClick={handleFitView}
        className="absolute top-3 right-3 z-10 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md border border-zinc-700 transition-colors"
      >
        Fit View
      </button>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          style: { stroke: '#3f3f46' },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
        <Controls
          showInteractive={false}
          className="!bg-zinc-800 !border-zinc-700 !shadow-lg [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400 [&>button:hover]:!bg-zinc-700"
        />
        <MiniMap
          className="!bg-zinc-800 !border-zinc-700"
          nodeColor={(node) => {
            switch (node.type) {
              case 'controlPlane':
                return '#34d399';
              case 'worker':
                return '#52525b';
              case 'session':
                return '#fbbf24';
              case 'proxy':
                return '#3f3f46';
              case 'daemon':
                return '#60a5fa';
              case 'external':
                return '#52525b';
              default:
                return '#3f3f46';
            }
          }}
          maskColor="rgba(9, 9, 11, 0.7)"
        />
      </ReactFlow>
    </div>
  );
}

export function Topology() {
  return (
    <ReactFlowProvider>
      <TopologyCanvas />
    </ReactFlowProvider>
  );
}
