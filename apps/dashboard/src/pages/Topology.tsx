import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
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
import { DaemonNode } from '../components/topology/DaemonNode.js';
import { ExposedPortNode } from '../components/topology/ExposedPortNode.js';
import type { Session } from '@paws/domain-session';
import type { FleetOverview, Worker } from '@paws/domain-fleet';
import { useEffect } from 'react';

const nodeTypes: NodeTypes = {
  controlPlane: ControlPlaneNode,
  worker: WorkerNode,
  session: SessionNode,
  daemon: DaemonNode,
  exposedPort: ExposedPortNode,
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
  const nodeKey = layoutNodes.map((n) => n.id).join(',');
  const edgeKey = layoutEdges.map((e) => e.id).join(',');
  useEffect(() => {
    setNodes(layoutNodes);
    setEdges(layoutEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by nodeKey/edgeKey to avoid infinite loop
  }, [nodeKey, edgeKey]);

  const isEmpty = workers.length === 0 && sessions.length === 0 && daemons.length === 0;
  const isLoading = fleet.loading && workersResult.loading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground/60 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-muted-foreground">Loading topology...</p>
        </div>
      </div>
    );
  }

  if (isEmpty && !fleet.data) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center">
          <pre className="text-muted-foreground/40 text-sm font-mono mb-3">
            {`  /\\_/\\
 ( -.- ) zzZ
  > ^ <`}
          </pre>
          <p className="text-muted-foreground text-sm">No agents running.</p>
          <p className="text-muted-foreground/60 text-xs mt-1">Create a daemon to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
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
          style: { stroke: 'var(--border)' },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={0.8} color="var(--divider)" />
        <Controls
          showInteractive={false}
          position="bottom-right"
          className="!bg-panel !border-border !shadow-sm !rounded-lg [&>button]:!bg-panel [&>button]:!border-border [&>button]:!text-muted-foreground [&>button:hover]:!bg-divider [&>button]:!rounded-md"
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
