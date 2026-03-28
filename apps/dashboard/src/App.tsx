import { BrowserRouter, Route, Routes } from 'react-router';

import { AuthGate } from './components/AuthGate.js';
import { Layout } from './components/Layout.js';
import { Fleet } from './pages/Fleet.js';
import { SessionDetail } from './pages/SessionDetail.js';
import { Sessions } from './pages/Sessions.js';
import { Setup } from './pages/Setup.js';

export function App() {
  return (
    <AuthGate>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Fleet />} />
            <Route path="setup" element={<Setup />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="sessions/:id" element={<SessionDetail />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthGate>
  );
}
