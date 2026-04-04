import { Link, useLocation } from '@tanstack/react-router';

import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/theme-toggle.js';
import {
  Globe,
  Server,
  HardDrive,
  Camera,
  Boxes,
  Bot,
  LayoutTemplate,
  Activity,
  Plug,
  Cpu,
  Eye,
  FileText,
  Settings,
  Wand2,
  LogOut,
  Search,
} from 'lucide-react';

type NavItem = {
  title: string;
  url: string;
  icon: React.ElementType;
  exact?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: '',
    items: [{ title: 'Topology', url: '/', icon: Globe, exact: true }],
  },
  {
    label: 'Infrastructure',
    items: [
      { title: 'Fleet', url: '/fleet', icon: Server },
      { title: 'Servers', url: '/servers', icon: HardDrive },
      { title: 'Snapshots', url: '/snapshots', icon: Camera },
    ],
  },
  {
    label: 'Agents',
    items: [
      { title: 'Workspaces', url: '/workspaces', icon: Boxes },
      { title: 'Daemons', url: '/daemons', icon: Bot },
      { title: 'Templates', url: '/templates', icon: LayoutTemplate },
      { title: 'Sessions', url: '/sessions', icon: Activity },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { title: 'Integrations', url: '/integrations', icon: Plug },
      { title: 'MCP Servers', url: '/mcp', icon: Cpu },
      { title: 'Observability', url: '/observability', icon: Eye },
      { title: 'Audit Log', url: '/audit', icon: FileText },
      { title: 'Settings', url: '/settings', icon: Settings },
      { title: 'Setup', url: '/setup', icon: Wand2 },
    ],
  },
];

async function handleLogout() {
  await fetch('/auth/password-logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  await fetch('/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  localStorage.removeItem('paws_api_key');
  localStorage.removeItem('paws_setup_skipped');
  document.cookie = 'paws_session=; Path=/; Max-Age=0';
  window.location.href = '/';
}

function openCommandPalette() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
}

export function AppSidebar() {
  const location = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  function isActive(url: string, exact?: boolean) {
    if (exact) return location.pathname === url;
    return location.pathname === url || location.pathname.startsWith(url + '/');
  }

  return (
    <Sidebar
      className={cn(
        '*:data-[slot=sidebar-inner]:bg-sidebar',
        '*:data-[slot=sidebar-inner]:border-r',
      )}
      collapsible="icon"
      variant="sidebar"
    >
      <SidebarHeader className={cn('justify-center border-b', isCollapsed ? 'h-12 px-1' : 'h-12 px-2')}>
        <SidebarMenuButton render={<Link to="/" />}>
          <img src="/logo.svg" alt="paws" className="size-5 shrink-0" />
          <span className="font-medium text-foreground!">paws</span>
        </SidebarMenuButton>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup className="py-1.5">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Search (⌘K)" onClick={openCommandPalette} size="sm">
                <Search className="size-4" />
                <span className="text-muted-foreground">Search...</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {navSections.map((section) => (
          <SidebarGroup key={section.label || '_top'} className="py-1">
            {section.label && (
              <SidebarGroupLabel className="text-[10px] uppercase tracking-wider group-data-[collapsible=icon]:pointer-events-none">
                {section.label}
              </SidebarGroupLabel>
            )}
            <SidebarMenu>
              {section.items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    isActive={isActive(item.url, item.exact)}
                    tooltip={item.title}
                    render={<Link to={item.url} />}
                    size="sm"
                  >
                    <item.icon className="size-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-0 p-0">
        <SidebarMenu className="border-t p-1.5">
          <SidebarMenuItem>
            <ThemeToggle />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="text-muted-foreground"
              size="sm"
              tooltip="Log out"
              onClick={handleLogout}
            >
              <LogOut className="size-4" />
              <span>Log out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
