import { Outlet, useLocation } from '@tanstack/react-router';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppNavbar } from '@/components/app-navbar.js';
import { AppSidebar } from '@/components/app-sidebar.js';
import { CommandPalette } from './CommandPalette.js';
import { ErrorBoundary } from './ErrorBoundary.js';

export function Layout() {
  const location = useLocation();
  const isCanvas = location.pathname === '/' || location.pathname === '/topology';

  return (
    <SidebarProvider defaultOpen={false}>
      <CommandPalette />
      <AppSidebar />
      <SidebarInset>
        {!isCanvas && <AppNavbar />}
        {isCanvas ? (
          <ErrorBoundary>
            <div key={location.pathname} className="h-[100dvh] animate-page-in">
              <Outlet />
            </div>
          </ErrorBoundary>
        ) : (
          <div className="flex-1 p-4 md:p-6 max-w-6xl">
            <ErrorBoundary>
              <div key={location.pathname} className="animate-page-in">
                <Outlet />
              </div>
            </ErrorBoundary>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
