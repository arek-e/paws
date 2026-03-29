import { BrowserRouter, Route, Routes } from 'react-router';

import { AuthGate } from './components/AuthGate.js';
import { FirstRunRedirect } from './components/FirstRunRedirect.js';
import { Layout } from './components/Layout.js';
import { AuditLog } from './pages/AuditLog.js';
import { Daemons } from './pages/Daemons.js';
import { McpServers } from './pages/McpServers.js';
import { Fleet } from './pages/Fleet.js';
import { Provision } from './pages/Provision.js';
import { Servers } from './pages/Servers.js';
import { SessionDetail } from './pages/SessionDetail.js';
import { Sessions } from './pages/Sessions.js';
import { Setup } from './pages/Setup.js';
import { Snapshots } from './pages/Snapshots.js';
import { Templates } from './pages/Templates.js';
import { Topology } from './pages/Topology.js';
import { Settings } from './pages/Settings.js';
import { Tunnels } from './pages/Tunnels.js';

export function App() {
  return (
    <AuthGate>
      <BrowserRouter>
        <Routes>
          {/* Setup wizard — full screen, no sidebar */}
          <Route path="setup" element={<Setup />} />

          {/* Main app with sidebar layout */}
          <Route element={<Layout />}>
            <Route index element={<FirstRunRedirect />} />
            <Route path="topology" element={<Topology />} />
            <Route path="daemons" element={<Daemons />} />
            <Route path="templates" element={<Templates />} />
            <Route path="snapshots" element={<Snapshots />} />
            <Route path="tunnels" element={<Tunnels />} />
            <Route path="servers" element={<Servers />} />
            <Route path="provision" element={<Provision />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="sessions/:id" element={<SessionDetail />} />
            <Route path="mcp" element={<McpServers />} />
            <Route path="audit" element={<AuditLog />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthGate>
  );
}
