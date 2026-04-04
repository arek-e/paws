import { useLocation } from '@tanstack/react-router';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { CustomSidebarTrigger } from '@/components/custom-sidebar-trigger.js';

const routeLabels: Record<string, { section?: string; label: string }> = {
  '/': { label: 'Topology' },
  '/topology': { label: 'Topology' },
  '/fleet': { section: 'Infrastructure', label: 'Fleet' },
  '/servers': { section: 'Infrastructure', label: 'Servers' },
  '/snapshots': { section: 'Infrastructure', label: 'Snapshots' },
  '/workspaces': { section: 'Agents', label: 'Workspaces' },
  '/daemons': { section: 'Agents', label: 'Daemons' },
  '/templates': { section: 'Agents', label: 'Templates' },
  '/sessions': { section: 'Agents', label: 'Sessions' },
  '/integrations': { section: 'Configuration', label: 'Integrations' },
  '/mcp': { section: 'Configuration', label: 'MCP Servers' },
  '/observability': { section: 'Configuration', label: 'Observability' },
  '/audit': { section: 'Configuration', label: 'Audit Log' },
  '/settings': { section: 'Configuration', label: 'Settings' },
  '/setup': { label: 'Setup Wizard' },
};

export function AppNavbar() {
  const location = useLocation();

  const route =
    routeLabels[location.pathname] ??
    (location.pathname.startsWith('/sessions/')
      ? { section: 'Agents', label: 'Session Detail' }
      : { label: location.pathname.slice(1) || 'Dashboard' });

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
      <CustomSidebarTrigger />
      <Separator className="mr-1 h-3.5 data-[orientation=vertical]:self-center" orientation="vertical" />
      <Breadcrumb>
        <BreadcrumbList className="text-xs">
          {route.section && (
            <>
              <BreadcrumbItem>
                <span className="text-muted-foreground">{route.section}</span>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbPage>{route.label}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}
