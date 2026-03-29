import { useState } from 'react';
import { Link, Outlet, useLocation } from '@tanstack/react-router';

import { VersionBadge } from './UpdateBanner.js';

function SidebarLink({ to, label, onClick }: { to: string; label: string; onClick?: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      activeOptions={{ exact: true }}
      activeProps={{
        className:
          'block px-4 py-1.5 rounded-md text-sm font-medium transition-colors bg-zinc-800 text-emerald-400',
      }}
      inactiveProps={{
        className:
          'block px-4 py-1.5 rounded-md text-sm font-medium transition-colors text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50',
      }}
    >
      {label}
    </Link>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
      {children}
    </p>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <SidebarLink to="/" label="Topology" onClick={onNavigate} />

      <SectionLabel>Infrastructure</SectionLabel>
      <SidebarLink to="/fleet" label="Fleet" onClick={onNavigate} />
      <SidebarLink to="/servers" label="Servers" onClick={onNavigate} />
      <SidebarLink to="/snapshots" label="Snapshots" onClick={onNavigate} />
      <SidebarLink to="/tunnels" label="Tunnels" onClick={onNavigate} />

      <SectionLabel>Agents</SectionLabel>
      <SidebarLink to="/daemons" label="Daemons" onClick={onNavigate} />
      <SidebarLink to="/templates" label="Templates" onClick={onNavigate} />
      <SidebarLink to="/sessions" label="Sessions" onClick={onNavigate} />

      <SectionLabel>Configuration</SectionLabel>
      <SidebarLink to="/mcp" label="MCP Servers" onClick={onNavigate} />
      <SidebarLink to="/audit" label="Audit Log" onClick={onNavigate} />
      <SidebarLink to="/settings" label="Settings" onClick={onNavigate} />
      <SidebarLink to="/setup" label="Setup Wizard" onClick={onNavigate} />
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

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const isFullBleed = location.pathname === '/' || location.pathname === '/topology';

  return (
    <div className="flex flex-col md:flex-row h-screen">
      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="paws" className="w-6 h-6" />
          <span className="text-sm font-semibold text-zinc-100">paws</span>
        </div>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-2 text-zinc-400 hover:text-zinc-100"
        >
          {menuOpen ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          )}
        </button>
      </header>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden border-b border-zinc-800 bg-zinc-950 p-3 space-y-0.5">
          <SidebarNav onNavigate={() => setMenuOpen(false)} />
          <div className="pt-3">
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 rounded-md transition-colors text-left"
            >
              Log out
            </button>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-52 flex-shrink-0 border-r border-zinc-800 bg-zinc-950 flex-col">
        <div className="p-4 border-b border-zinc-800">
          <img src="/logo.svg" alt="paws" className="w-8 h-8" />
          <p className="mt-2 text-sm font-semibold text-zinc-100">paws</p>
          <p className="text-xs text-zinc-500">fleet dashboard</p>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          <SidebarNav />
        </nav>
        <div className="p-3 border-t border-zinc-800 space-y-2">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 rounded-md transition-colors text-left"
          >
            Log out
          </button>
          <div className="px-4">
            <VersionBadge />
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-zinc-950">
        {isFullBleed ? (
          <div className="h-full">
            <Outlet />
          </div>
        ) : (
          <div className="p-4 md:p-6 max-w-6xl">
            <Outlet />
          </div>
        )}
      </main>
    </div>
  );
}
