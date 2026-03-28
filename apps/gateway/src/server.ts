import { createBunWebSocket } from 'hono/bun';

import { createGatewayApp } from './app.js';
import { createK8sDiscovery } from './discovery/k8s.js';
import { createWorkerRegistry } from './discovery/registry.js';
import { createStaticDiscovery } from './discovery/static.js';

const PORT = parseInt(process.env['PORT'] ?? '4000', 10);
const API_KEY = process.env['API_KEY'] ?? 'paws-dev-key';
const WORKER_URL = process.env['WORKER_URL'] ?? '';

// OIDC config (optional — set all 4 to enable)
const OIDC_ISSUER = process.env['OIDC_ISSUER'] ?? '';
const OIDC_CLIENT_ID = process.env['OIDC_CLIENT_ID'] ?? '';
const OIDC_CLIENT_SECRET = process.env['OIDC_CLIENT_SECRET'] ?? '';
const OIDC_REDIRECT_URI =
  process.env['OIDC_REDIRECT_URI'] ?? `http://localhost:${PORT}/auth/callback`;
const AUTH_SECRET = process.env['AUTH_SECRET'] ?? '';
const OIDC_EXTERNAL_URL = process.env['OIDC_AUTH_EXTERNAL_URL'] ?? '';

const oidc =
  OIDC_ISSUER && OIDC_CLIENT_ID && OIDC_CLIENT_SECRET && AUTH_SECRET
    ? {
        issuer: OIDC_ISSUER,
        clientId: OIDC_CLIENT_ID,
        clientSecret: OIDC_CLIENT_SECRET,
        redirectUri: OIDC_REDIRECT_URI,
        authSecret: AUTH_SECRET,
        ...(OIDC_EXTERNAL_URL && { externalUrl: OIDC_EXTERNAL_URL }),
      }
    : undefined;

// Worker discovery — three layers, merged:
// 1. Call-home registry (workers connect via WebSocket)
// 2. K8s pod-watching (in-cluster)
// 3. Static URLs (manual WORKER_URL)
const workerRegistry = createWorkerRegistry();
const k8sDiscovery = createK8sDiscovery();
const staticUrls = WORKER_URL ? [WORKER_URL] : [];
const staticDiscovery = createStaticDiscovery(staticUrls);

const discovery = {
  async getWorkers() {
    // Registry workers are most up-to-date (live WebSocket connection)
    const registryWorkers = await workerRegistry.getWorkers();
    if (registryWorkers.length > 0) return registryWorkers;

    // K8s discovery (in-cluster)
    const k8sWorkers = await k8sDiscovery.getWorkers();
    if (k8sWorkers.length > 0) return k8sWorkers;

    // Static fallback (manual WORKER_URL)
    return staticDiscovery.getWorkers();
  },
};

const DASHBOARD_DIR = process.env['DASHBOARD_DIR'] ?? '';
const { upgradeWebSocket, websocket } = createBunWebSocket();

const app = await createGatewayApp({
  apiKey: API_KEY,
  discovery,
  workerRegistry,
  upgradeWebSocket,
  ...(DASHBOARD_DIR && { dashboardDir: DASHBOARD_DIR }),
  ...(oidc && { oidc }),
});

const discoveryMode = [];
discoveryMode.push('call-home');
if (WORKER_URL) discoveryMode.push(`static (${WORKER_URL})`);
discoveryMode.push('k8s');

console.log(`
 /\\_/\\
( o.o )  paws gateway
 > ^ <

Listening on :${PORT}
Worker discovery: ${discoveryMode.join(' + ')}
Auth: ${oidc ? `OIDC (${OIDC_ISSUER})` : 'API key only'}
Dashboard: ${DASHBOARD_DIR ? `serving from ${DASHBOARD_DIR}` : 'disabled (set DASHBOARD_DIR)'}
OpenAPI spec: http://localhost:${PORT}/openapi.json
`);

export default {
  port: PORT,
  fetch: app.fetch,
  websocket,
};
