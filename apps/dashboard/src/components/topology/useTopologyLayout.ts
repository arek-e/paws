import { useMemo } from 'react';
import Dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import type { FleetOverview, Session, Worker } from '@paws/types';

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

// Known external APIs that sessions typically connect to
const KNOWN_EXTERNALS = ['api.anthropic.com', 'api.openai.com', 'github.com'];

function buildGraph(input: TopologyInput): { nodes: Node[]; edges: Edge[] } {
  const { fleet, workers, sessions, daemons } = input;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // 1. Control Plane node
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

  // 2. Daemon nodes (left side)
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
      label: 'triggers',
      labelStyle: { fill: '#71717a', fontSize: 10 },
      labelBgStyle: { fill: '#09090b' },
    });
  }

  // 3. Worker nodes
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
    });
  }

  // 4. Session + Proxy nodes (grouped under their worker)
  const activeSessions = sessions.filter((s) => s.status === 'running' || s.status === 'pending');
  const externalDomains = new Set<string>();

  for (const session of activeSessions) {
    const workerId = session.worker
      ? `worker-${session.worker}`
      : workers[0]
        ? `worker-${workers[0].name}`
        : null;
    if (!workerId) continue;

    const sessionId = `session-${session.sessionId}`;
    const proxyId = `proxy-${session.sessionId}`;

    nodes.push({
      id: sessionId,
      type: 'session',
      position: { x: 0, y: 0 },
      data: {
        sessionId: session.sessionId,
        status: session.status,
        daemonRole: (session.metadata as Record<string, string> | undefined)?.daemonRole,
        startedAt: session.startedAt,
      },
    });

    edges.push({
      id: `${workerId}->${sessionId}`,
      source: workerId,
      target: sessionId,
      style: { stroke: 'rgba(52, 211, 153, 0.4)' },
    });

    // Proxy node for this session
    nodes.push({
      id: proxyId,
      type: 'proxy',
      position: { x: 0, y: 0 },
      data: { domainCount: KNOWN_EXTERNALS.length },
    });

    edges.push({
      id: `${sessionId}->${proxyId}`,
      source: sessionId,
      target: proxyId,
      style: { stroke: '#3f3f46', strokeDasharray: '4 2' },
    });

    // Connect proxy to external APIs
    for (const domain of KNOWN_EXTERNALS) {
      externalDomains.add(domain);
      edges.push({
        id: `${proxyId}->${domain}`,
        source: proxyId,
        target: `external-${domain}`,
        style: { stroke: session.status === 'running' ? 'rgba(52, 211, 153, 0.5)' : '#3f3f46' },
        animated: session.status === 'running',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#52525b', width: 12, height: 12 },
      });
    }
  }

  // If no active sessions, still show external domains as reference
  if (activeSessions.length === 0) {
    for (const domain of KNOWN_EXTERNALS) {
      externalDomains.add(domain);
    }
  }

  // 5. External API nodes
  for (const domain of externalDomains) {
    nodes.push({
      id: `external-${domain}`,
      type: 'external',
      position: { x: 0, y: 0 },
      data: { domain },
    });
  }

  return { nodes, edges };
}

// Approximate node dimensions for dagre layout
const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  controlPlane: { width: 220, height: 80 },
  worker: { width: 170, height: 65 },
  session: { width: 150, height: 90 },
  proxy: { width: 110, height: 45 },
  daemon: { width: 140, height: 40 },
  external: { width: 130, height: 35 },
};

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'TB',
    nodesep: 60,
    ranksep: 80,
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
