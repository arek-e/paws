import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';

import { VersionBadge } from './UpdateBanner.js';

function SidebarLink({ to, label, onClick }: { to: string; label: string; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end
      onClick={onClick}
      className={({ isActive }) =>
        `block px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? 'bg-zinc-800 text-emerald-400'
            : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
        }`
      }
    >
      {label}
    </NavLink>
  );
}

function handleLogout() {
  localStorage.removeItem('paws_api_key');
  window.location.reload();
}

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);

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
        <div className="md:hidden border-b border-zinc-800 bg-zinc-950 p-3 space-y-1">
          <SidebarLink to="/" label="Fleet" onClick={() => setMenuOpen(false)} />
          <SidebarLink to="/daemons" label="Daemons" onClick={() => setMenuOpen(false)} />
          <SidebarLink to="/templates" label="Templates" onClick={() => setMenuOpen(false)} />
          <SidebarLink to="/snapshots" label="Snapshots" onClick={() => setMenuOpen(false)} />
          <SidebarLink to="/tunnels" label="Tunnels" onClick={() => setMenuOpen(false)} />
          <SidebarLink to="/servers" label="Servers" onClick={() => setMenuOpen(false)} />
          <SidebarLink to="/sessions" label="Sessions" onClick={() => setMenuOpen(false)} />
          <SidebarLink to="/provision" label="Provision" onClick={() => setMenuOpen(false)} />
          <SidebarLink to="/audit" label="Audit Log" onClick={() => setMenuOpen(false)} />
          <SidebarLink to="/setup" label="Setup" onClick={() => setMenuOpen(false)} />
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 rounded-md transition-colors text-left"
          >
            Disconnect
          </button>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-shrink-0 border-r border-zinc-800 bg-zinc-950 flex-col">
        <div className="p-4 border-b border-zinc-800">
          <img src="/logo.svg" alt="paws" className="w-8 h-8" />
          <p className="mt-2 text-sm font-semibold text-zinc-100">paws</p>
          <p className="text-xs text-zinc-500">fleet dashboard</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <SidebarLink to="/" label="Fleet" />
          <SidebarLink to="/daemons" label="Daemons" />
          <SidebarLink to="/templates" label="Templates" />
          <SidebarLink to="/snapshots" label="Snapshots" />
          <SidebarLink to="/tunnels" label="Tunnels" />
          <SidebarLink to="/servers" label="Servers" />
          <SidebarLink to="/sessions" label="Sessions" />
          <SidebarLink to="/provision" label="Provision" />
          <SidebarLink to="/audit" label="Audit Log" />
          <SidebarLink to="/setup" label="Setup" />
        </nav>
        <div className="p-3 border-t border-zinc-800 space-y-2">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 rounded-md transition-colors text-left"
          >
            Disconnect
          </button>
          <div className="px-4">
            <VersionBadge />
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-zinc-950">
        <div className="p-4 md:p-6 max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
