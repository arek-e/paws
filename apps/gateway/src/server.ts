import { createGatewayApp } from './app.js';
import { createK8sDiscovery } from './discovery/k8s.js';
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

const oidc =
  OIDC_ISSUER && OIDC_CLIENT_ID && OIDC_CLIENT_SECRET && AUTH_SECRET
    ? {
        issuer: OIDC_ISSUER,
        clientId: OIDC_CLIENT_ID,
        clientSecret: OIDC_CLIENT_SECRET,
        redirectUri: OIDC_REDIRECT_URI,
        authSecret: AUTH_SECRET,
      }
    : undefined;

// Worker discovery
const k8sDiscovery = createK8sDiscovery();
const staticUrls = WORKER_URL ? [WORKER_URL] : [];
const staticDiscovery = createStaticDiscovery(staticUrls);

const discovery = {
  async getWorkers() {
    const k8sWorkers = await k8sDiscovery.getWorkers();
    if (k8sWorkers.length > 0) return k8sWorkers;
    return staticDiscovery.getWorkers();
  },
};

const DASHBOARD_DIR = process.env['DASHBOARD_DIR'] ?? '';

const app = await createGatewayApp({
  apiKey: API_KEY,
  discovery,
  ...(DASHBOARD_DIR && { dashboardDir: DASHBOARD_DIR }),
  ...(oidc && { oidc }),
});

const workerMode = WORKER_URL ? `static (${WORKER_URL})` : 'k8s pod-watch';

console.log(`
 /\\_/\\
( o.o )  paws gateway
 > ^ <

Listening on :${PORT}
Worker discovery: ${workerMode}
Auth: ${oidc ? `OIDC (${OIDC_ISSUER})` : 'API key only'}
Dashboard: ${DASHBOARD_DIR ? `serving from ${DASHBOARD_DIR}` : 'disabled (set DASHBOARD_DIR)'}
OpenAPI spec: http://localhost:${PORT}/openapi.json
`);

export default {
  port: PORT,
  fetch: app.fetch,
};
