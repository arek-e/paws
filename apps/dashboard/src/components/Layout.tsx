import { useState } from 'react';
import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { ChevronsLeft, ChevronsRight, Menu, Moon, Search, Sun } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

import { CommandPalette } from './CommandPalette.js';
import { ErrorBoundary } from './ErrorBoundary.js';
import { VersionBadge } from './UpdateBanner.js';

function SidebarLink({
  to,
  label,
  onClick,
  collapsed,
}: {
  to: string;
  label: string;
  onClick?: (() => void) | undefined;
  collapsed?: boolean | undefined;
}) {
  const link = (
    <Link
      to={to}
      onClick={onClick}
      activeOptions={{ exact: true }}
      activeProps={{
        className: collapsed
          ? 'flex items-center justify-center w-8 h-8 rounded-md text-sm font-medium transition-colors bg-zinc-800 text-emerald-400 mx-auto'
          : 'block px-4 py-1.5 rounded-md text-sm font-medium transition-colors bg-zinc-800 text-emerald-400',
      }}
      inactiveProps={{
        className: collapsed
          ? 'flex items-center justify-center w-8 h-8 rounded-md text-sm font-medium transition-colors text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 mx-auto'
          : 'block px-4 py-1.5 rounded-md text-sm font-medium transition-colors text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50',
      }}
    >
      {collapsed ? label.charAt(0) : label}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={<span className="block" />}>{link}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }
  return link;
}

function SectionLabel({
  children,
  collapsed,
}: {
  children: string;
  collapsed?: boolean | undefined;
}) {
  if (collapsed) {
    return <Separator className="my-2 mx-auto w-6 bg-zinc-800" />;
  }
  return (
    <p className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
      {children}
    </p>
  );
}

function SidebarNav({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  return (
    <>
      <SidebarLink to="/" label="Topology" onClick={onNavigate} collapsed={collapsed} />

      <SectionLabel collapsed={collapsed}>Infrastructure</SectionLabel>
      <SidebarLink to="/fleet" label="Fleet" onClick={onNavigate} collapsed={collapsed} />
      <SidebarLink to="/servers" label="Servers" onClick={onNavigate} collapsed={collapsed} />
      <SidebarLink to="/snapshots" label="Snapshots" onClick={onNavigate} collapsed={collapsed} />

      <SectionLabel collapsed={collapsed}>Agents</SectionLabel>
      <SidebarLink to="/daemons" label="Daemons" onClick={onNavigate} collapsed={collapsed} />
      <SidebarLink to="/templates" label="Templates" onClick={onNavigate} collapsed={collapsed} />
      <SidebarLink to="/sessions" label="Sessions" onClick={onNavigate} collapsed={collapsed} />

      <SectionLabel collapsed={collapsed}>Configuration</SectionLabel>
      <SidebarLink
        to="/integrations"
        label="Integrations"
        onClick={onNavigate}
        collapsed={collapsed}
      />
      <SidebarLink to="/mcp" label="MCP Servers" onClick={onNavigate} collapsed={collapsed} />
      <SidebarLink
        to="/observability"
        label="Observability"
        onClick={onNavigate}
        collapsed={collapsed}
      />
      <SidebarLink to="/audit" label="Audit Log" onClick={onNavigate} collapsed={collapsed} />
      <SidebarLink to="/settings" label="Settings" onClick={onNavigate} collapsed={collapsed} />
      <SidebarLink to="/setup" label="Setup Wizard" onClick={onNavigate} collapsed={collapsed} />
    </>
  );
}

async function handleLogout() {
  // Clear password auth session cookie
  await fetch('/auth/password-logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  // Clear OIDC session cookie
  await fetch('/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  // Clear local state
  localStorage.removeItem('paws_api_key');
  localStorage.removeItem('paws_setup_skipped');
  document.cookie = 'paws_session=; Path=/; Max-Age=0';
  window.location.href = '/';
}

function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('paws_theme', next);
  }

  if (collapsed) {
    const label = theme === 'dark' ? 'Light mode' : 'Dark mode';
    return (
      <Tooltip>
        <TooltipTrigger render={<span className="block" />}>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            className="w-full justify-center px-0 text-xs text-muted-foreground"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="w-full justify-start px-4 text-xs text-muted-foreground"
    >
      {theme === 'dark' ? (
        <>
          <Sun className="mr-2 h-3.5 w-3.5" /> Light mode
        </>
      ) : (
        <>
          <Moon className="mr-2 h-3.5 w-3.5" /> Dark mode
        </>
      )}
    </Button>
  );
}

export function Layout() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const location = useLocation();
  const isFullBleed = location.pathname === '/' || location.pathname === '/topology';

  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('paws_sidebar_collapsed') === 'true';
  });

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('paws_sidebar_collapsed', String(next));
  }

  return (
    <div className="flex flex-col md:flex-row h-screen">
      <CommandPalette />
      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="paws" className="w-6 h-6" />
          <span className="text-sm font-semibold text-zinc-100">paws</span>
        </div>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-zinc-100" />
            }
          >
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="left" className="bg-zinc-950 border-zinc-800">
            <SheetHeader>
              <SheetTitle className="text-zinc-100">paws</SheetTitle>
              <SheetDescription>fleet dashboard</SheetDescription>
            </SheetHeader>
            <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
              <SidebarNav onNavigate={() => setSheetOpen(false)} />
            </nav>
            <Separator className="bg-zinc-800" />
            <div className="p-3 space-y-2">
              <ThemeToggle />
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="w-full justify-start px-4 py-2 text-xs text-zinc-500 hover:text-zinc-300"
              >
                Log out
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-shrink-0 border-r border-zinc-800 bg-zinc-950 flex-col transition-all duration-200',
          collapsed ? 'w-14' : 'w-52',
        )}
      >
        <div
          className={cn('border-b border-zinc-800', collapsed ? 'p-2 flex justify-center' : 'p-4')}
        >
          <img src="/logo.svg" alt="paws" className="w-8 h-8" />
          {!collapsed && (
            <>
              <p className="mt-2 text-sm font-semibold text-zinc-100">paws</p>
              <p className="text-xs text-zinc-500">fleet dashboard</p>
            </>
          )}
        </div>

        {!collapsed && (
          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={() =>
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
              }
              className="flex w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
            >
              <span>Search...</span>
              <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
                &#8984;K
              </kbd>
            </button>
          </div>
        )}
        {collapsed && (
          <div className="px-2 pt-3 flex justify-center">
            <Tooltip>
              <TooltipTrigger render={<span className="block" />}>
                <button
                  type="button"
                  onClick={() =>
                    document.dispatchEvent(
                      new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
                    )
                  }
                  className="flex items-center justify-center w-8 h-8 rounded-md border border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
                >
                  <Search className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Search (&#8984;K)</TooltipContent>
            </Tooltip>
          </div>
        )}

        <nav className={cn('flex-1 space-y-0.5 overflow-y-auto', collapsed ? 'p-1' : 'p-2')}>
          <SidebarNav collapsed={collapsed} />
        </nav>

        <Separator className="bg-zinc-800" />
        <div className={cn('space-y-2', collapsed ? 'p-1' : 'p-3')}>
          <ThemeToggle collapsed={collapsed} />
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger render={<span className="block" />}>
                <Button
                  variant="ghost"
                  onClick={handleLogout}
                  className="w-full justify-center px-0 py-1.5 text-xs text-zinc-500 hover:text-zinc-300"
                >
                  <span className="text-sm">L</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Log out</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full justify-start px-4 py-1.5 text-xs text-zinc-500 hover:text-zinc-300"
            >
              Log out
            </Button>
          )}
          {!collapsed && (
            <div className="px-4">
              <VersionBadge />
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <div className="border-t border-zinc-800 p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            className={cn(
              'w-full text-xs text-zinc-500 hover:text-zinc-300',
              collapsed ? 'justify-center px-0' : 'justify-start px-4',
            )}
          >
            {collapsed ? (
              <ChevronsRight className="h-3.5 w-3.5" />
            ) : (
              <>
                <ChevronsLeft className="mr-2 h-3.5 w-3.5" /> Collapse
              </>
            )}
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-zinc-950">
        {isFullBleed ? (
          <div className="h-full">
            <ErrorBoundary>
              <div key={location.pathname} className="h-full animate-page-in">
                <Outlet />
              </div>
            </ErrorBoundary>
          </div>
        ) : (
          <div className="p-4 md:p-6 max-w-6xl">
            <ErrorBoundary>
              <div key={location.pathname} className="animate-page-in">
                <Outlet />
              </div>
            </ErrorBoundary>
          </div>
        )}
      </main>
    </div>
  );
}
