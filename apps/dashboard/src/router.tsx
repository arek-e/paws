import {
  createRouter,
  createRoute,
  createRootRoute,
  redirect,
  Outlet,
} from '@tanstack/react-router';

import { AuthGate } from './components/AuthGate.js';
import { Layout } from './components/Layout.js';
import { AuditLog } from './pages/AuditLog.js';
import { Daemons } from './pages/Daemons.js';
import { Fleet } from './pages/Fleet.js';
import { McpServers } from './pages/McpServers.js';
import { Servers } from './pages/Servers.js';
import { SessionDetail } from './pages/SessionDetail.js';
import { Sessions } from './pages/Sessions.js';
import { Setup } from './pages/Setup.js';
import { Snapshots } from './pages/Snapshots.js';
import { Templates } from './pages/Templates.js';
import { Topology } from './pages/Topology.js';
import { Tunnels } from './pages/Tunnels.js';

// Root route wraps everything in AuthGate
const rootRoute = createRootRoute({
  component: () => (
    <AuthGate>
      <Outlet />
    </AuthGate>
  ),
});

// Setup wizard — full screen, no sidebar
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: Setup,
});

// Layout route (sidebar) — pathless layout wrapper
const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'layout',
  component: Layout,
});

// Index route — check first-run redirect, then show Topology
const indexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/',
  beforeLoad: async () => {
    try {
      const res = await fetch('/v1/setup/status', { credentials: 'include' });
      const data = (await res.json()) as { needsOnboarding: boolean };
      const skipped = localStorage.getItem('paws_setup_skipped') === 'true';
      if (data.needsOnboarding && !skipped) {
        throw redirect({ to: '/setup' });
      }
    } catch (e) {
      // Re-throw redirects (redirect() returns a special object, not an Error)
      if (e != null && typeof e === 'object' && 'to' in e) throw e;
      // Swallow fetch errors — just show topology
    }
  },
  component: Topology,
});

const topologyRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/topology',
  component: Topology,
});

const fleetRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/fleet',
  component: Fleet,
});

const daemonsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/daemons',
  component: Daemons,
});

const templatesRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/templates',
  component: Templates,
});

const snapshotsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/snapshots',
  component: Snapshots,
});

const tunnelsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/tunnels',
  component: Tunnels,
});

const serversRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/servers',
  component: Servers,
});

const sessionsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/sessions',
  component: Sessions,
});

const sessionDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/sessions/$id',
  component: SessionDetail,
});

const mcpRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/mcp',
  component: McpServers,
});

const auditRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/audit',
  component: AuditLog,
});

const routeTree = rootRoute.addChildren([
  setupRoute,
  layoutRoute.addChildren([
    indexRoute,
    topologyRoute,
    fleetRoute,
    daemonsRoute,
    templatesRoute,
    snapshotsRoute,
    tunnelsRoute,
    serversRoute,
    sessionsRoute,
    sessionDetailRoute,
    mcpRoute,
    auditRoute,
  ]),
]);

export const router = createRouter({ routeTree });

// Type registration for useNavigate, useParams, etc.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
