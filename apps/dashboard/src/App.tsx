import { BrowserRouter, Route, Routes } from 'react-router';

import { AuthGate } from './components/AuthGate.js';
import { Layout } from './components/Layout.js';
import { Daemons } from './pages/Daemons.js';
import { Fleet } from './pages/Fleet.js';
import { Servers } from './pages/Servers.js';
import { SessionDetail } from './pages/SessionDetail.js';
import { Sessions } from './pages/Sessions.js';
import { Setup } from './pages/Setup.js';
import { Snapshots } from './pages/Snapshots.js';
import { Provision } from './pages/Provision.js';
import { Templates } from './pages/Templates.js';
import { Tunnels } from './pages/Tunnels.js';

export function App() {
  return (
    <AuthGate>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Fleet />} />
            <Route path="daemons" element={<Daemons />} />
            <Route path="templates" element={<Templates />} />
            <Route path="snapshots" element={<Snapshots />} />
            <Route path="tunnels" element={<Tunnels />} />
            <Route path="servers" element={<Servers />} />
            <Route path="provision" element={<Provision />} />
            <Route path="setup" element={<Setup />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="sessions/:id" element={<SessionDetail />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthGate>
  );
}
