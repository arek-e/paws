import { useMemo } from 'react';
import Dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import type { Session } from '@paws/domain-session';
import type { FleetOverview, Worker } from '@paws/types';

interface DaemonItem {
  role: string;
  trigger: { type: string };
  status: string;
}

interface TopologyInput {
  fleet: FleetOverview | null;
  workers: Worker[];
  sessions: Session[];
  daemons: DaemonItem[];
}

function buildGraph(input: TopologyInput): { nodes: Node[]; edges: Edge[] } {
  const { fleet, workers, sessions, daemons } = input;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // 1. Control Plane node (top center)
  nodes.push({
    id: 'control-plane',
    type: 'controlPlane',
    position: { x: 0, y: 0 },
    data: {
      activeDaemons: fleet?.activeDaemons ?? daemons.length,
      activeSessions:
        fleet?.activeSessions ?? sessions.filter((s) => s.status === 'running').length,
      healthy: true,
    },
  });

  // 2. Daemon nodes (connected to control plane)
  for (const daemon of daemons) {
    const id = `daemon-${daemon.role}`;
    nodes.push({
      id,
      type: 'daemon',
      position: { x: 0, y: 0 },
      data: {
        role: daemon.role,
        triggerType: daemon.trigger.type,
        status: daemon.status,
      },
    });

    edges.push({
      id: `${id}->control-plane`,
      source: id,
      target: 'control-plane',
      targetHandle: 'daemon-target',
      style: { stroke: '#3f3f46', strokeDasharray: '6 3' },
      label: daemon.trigger.type,
      labelStyle: { fill: '#71717a', fontSize: 10 },
      labelBgStyle: { fill: '#09090b' },
    });
  }

  // 3. Worker nodes (below control plane)
  for (const worker of workers) {
    const id = `worker-${worker.name}`;
    nodes.push({
      id,
      type: 'worker',
      position: { x: 0, y: 0 },
      data: {
        name: worker.name,
        status: worker.status,
        running: worker.capacity.running,
        maxConcurrent: worker.capacity.maxConcurrent,
      },
    });

    edges.push({
      id: `control-plane->${id}`,
      source: 'control-plane',
      target: id,
      style: { stroke: '#52525b' },
      animated: worker.capacity.running > 0,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#52525b', width: 10, height: 10 },
    });
  }

  // 4. Session nodes (below their worker)
  const activeSessions = sessions.filter((s) => s.status === 'running' || s.status === 'pending');

  for (const session of activeSessions) {
    const workerId = session.worker
      ? `worker-${session.worker}`
      : workers[0]
        ? `worker-${workers[0].name}`
        : null;
    if (!workerId) continue;

    const sessionId = `session-${session.sessionId}`;

    // Collect exposed ports for this session
    const ports = (session.exposedPorts ?? []) as Array<{
      port: number;
      url: string;
      label?: string;
    }>;

    nodes.push({
      id: sessionId,
      type: 'session',
      position: { x: 0, y: 0 },
      data: {
        sessionId: session.sessionId,
        status: session.status,
        daemonRole: (session.metadata as Record<string, string> | undefined)?.daemonRole,
        startedAt: session.startedAt,
        exposedPorts: ports,
      },
    });

    edges.push({
      id: `${workerId}->${sessionId}`,
      source: workerId,
      target: sessionId,
      style: { stroke: 'rgba(52, 211, 153, 0.4)' },
      animated: session.status === 'running',
    });

    // 5. Exposed port nodes (below session — these are the preview URLs)
    for (const port of ports) {
      const portId = `port-${session.sessionId}-${port.port}`;
      nodes.push({
        id: portId,
        type: 'exposedPort',
        position: { x: 0, y: 0 },
        data: {
          port: port.port,
          url: port.url,
          label: port.label,
        },
      });

      edges.push({
        id: `${sessionId}->${portId}`,
        source: sessionId,
        target: portId,
        style: { stroke: '#60a5fa', strokeDasharray: '4 2' },
        label: `:${port.port}`,
        labelStyle: { fill: '#60a5fa', fontSize: 9 },
        labelBgStyle: { fill: '#09090b' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#60a5fa', width: 10, height: 10 },
      });
    }
  }

  return { nodes, edges };
}

// Approximate node dimensions for dagre layout
const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  controlPlane: { width: 220, height: 80 },
  worker: { width: 170, height: 65 },
  session: { width: 150, height: 90 },
  daemon: { width: 140, height: 40 },
  exposedPort: { width: 160, height: 40 },
};

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'TB',
    nodesep: 50,
    ranksep: 70,
    marginx: 40,
    marginy: 40,
  });

  for (const node of nodes) {
    const dims = NODE_DIMENSIONS[node.type ?? 'controlPlane'] ?? { width: 150, height: 50 };
    g.setNode(node.id, { width: dims.width, height: dims.height });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  Dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    const dims = NODE_DIMENSIONS[node.type ?? 'controlPlane'] ?? { width: 150, height: 50 };
    return {
      ...node,
      position: {
        x: pos.x - dims.width / 2,
        y: pos.y - dims.height / 2,
      },
    };
  });
}

export function useTopologyLayout(input: TopologyInput) {
  return useMemo(() => {
    const { nodes, edges } = buildGraph(input);
    const layoutNodes = applyDagreLayout(nodes, edges);
    return { nodes: layoutNodes, edges };
  }, [input.fleet, input.workers, input.sessions, input.daemons]);
}
