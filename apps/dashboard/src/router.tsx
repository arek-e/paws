import {
  createRouter,
  createRoute,
  createRootRoute,
  redirect,
  Outlet,
} from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

import { AuthGate } from './components/AuthGate.js';
import { Layout } from './components/Layout.js';
import { Skeleton } from './components/ui/skeleton.js';
import { Topology } from './pages/Topology.js';

// ---------------------------------------------------------------------------
// Skeleton variants — page-type-specific loading fallbacks
// ---------------------------------------------------------------------------

/** Page with header + stat cards + list */
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

/** Page with header + table */
function TableSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-48" />
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    </div>
  );
}

/** Page with header + card grid */
function CardGridSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-48" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </div>
  );
}

/** Full-screen skeleton (for Setup) */
function FullScreenSkeleton() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Skeleton className="h-96 w-full max-w-lg" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lazy page wrapper
// ---------------------------------------------------------------------------

/** Wrap a lazy component in Suspense with a skeleton fallback */
function lazyPage(
  Component: React.LazyExoticComponent<React.ComponentType>,
  fallback: React.ReactNode = <DashboardSkeleton />,
) {
  return function LazyPage() {
    return (
      <Suspense fallback={<div className="p-6">{fallback}</div>}>
        <Component />
      </Suspense>
    );
  };
}

/** Full-screen variant without the p-6 wrapper */
function lazyFullScreenPage(
  Component: React.LazyExoticComponent<React.ComponentType>,
  fallback: React.ReactNode = <FullScreenSkeleton />,
) {
  return function LazyPage() {
    return (
      <Suspense fallback={fallback}>
        <Component />
      </Suspense>
    );
  };
}

// ---------------------------------------------------------------------------
// Lazy-loaded page components (code-split per route)
// ---------------------------------------------------------------------------

const AuditLog = lazy(() => import('./pages/AuditLog.js').then((m) => ({ default: m.AuditLog })));
const Daemons = lazy(() => import('./pages/Daemons.js').then((m) => ({ default: m.Daemons })));
const Fleet = lazy(() => import('./pages/Fleet.js').then((m) => ({ default: m.Fleet })));
const Integrations = lazy(() =>
  import('./pages/Integrations.js').then((m) => ({ default: m.Integrations })),
);
const McpServers = lazy(() =>
  import('./pages/McpServers.js').then((m) => ({ default: m.McpServers })),
);
const Servers = lazy(() => import('./pages/Servers.js').then((m) => ({ default: m.Servers })));
const SessionDetail = lazy(() =>
  import('./pages/SessionDetail.js').then((m) => ({ default: m.SessionDetail })),
);
const Sessions = lazy(() => import('./pages/Sessions.js').then((m) => ({ default: m.Sessions })));
const Setup = lazy(() => import('./pages/Setup.js').then((m) => ({ default: m.Setup })));
const Snapshots = lazy(() =>
  import('./pages/Snapshots.js').then((m) => ({ default: m.Snapshots })),
);
const Templates = lazy(() =>
  import('./pages/Templates.js').then((m) => ({ default: m.Templates })),
);
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
  component: lazyFullScreenPage(Setup),
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
  component: lazyPage(Fleet, <DashboardSkeleton />),
});

const daemonsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/daemons',
  component: lazyPage(Daemons, <CardGridSkeleton />),
});

const templatesRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/templates',
  component: lazyPage(Templates, <CardGridSkeleton />),
});

const snapshotsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/snapshots',
  component: lazyPage(Snapshots, <CardGridSkeleton />),
});

const serversRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/servers',
  component: lazyPage(Servers, <CardGridSkeleton />),
});

const sessionsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/sessions',
  component: lazyPage(Sessions, <TableSkeleton />),
});

const sessionDetailRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/sessions/$id',
  component: lazyPage(SessionDetail, <DashboardSkeleton />),
});

const integrationsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/integrations',
  component: lazyPage(Integrations, <CardGridSkeleton />),
});

const mcpRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/mcp',
  component: lazyPage(McpServers, <CardGridSkeleton />),
});

const auditRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/audit',
  component: lazyPage(AuditLog, <TableSkeleton />),
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
    serversRoute,
    sessionsRoute,
    sessionDetailRoute,
    integrationsRoute,
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
