import { createBunWebSocket } from 'hono/bun';

import { createControlPlaneApp } from './app.js';
import { createK8sDiscovery } from './discovery/k8s.js';
import { createPangolinDiscovery } from './discovery/pangolin.js';
import { createWorkerRegistry } from './discovery/registry.js';
import { createStaticDiscovery } from './discovery/static.js';
import { createDatabase } from './db/index.js';

const PORT = parseInt(process.env['PORT'] ?? '4000', 10);
const API_KEY = process.env['API_KEY'] ?? 'paws-dev-key';
const WORKER_URL = process.env['WORKER_URL'] ?? '';

// Pangolin discovery config (optional — set URL + orgId + either apiKey or email/password)
const PANGOLIN_API_URL = process.env['PANGOLIN_API_URL'] ?? '';
const PANGOLIN_API_KEY = process.env['PANGOLIN_API_KEY'] ?? '';
const PANGOLIN_ORG_ID = process.env['PANGOLIN_ORG_ID'] ?? '';
const PANGOLIN_EMAIL = process.env['PANGOLIN_EMAIL'] ?? '';
const PANGOLIN_PASSWORD = process.env['PANGOLIN_PASSWORD'] ?? '';

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

// Worker discovery — four layers, first match wins:
// 1. Pangolin tunnel discovery (workers connect via Newt/WireGuard)
// 2. Call-home registry (workers connect via WebSocket — legacy)
// 3. K8s pod-watching (in-cluster)
// 4. Static URLs (manual WORKER_URL)
const hasPangolinAuth = PANGOLIN_API_KEY || (PANGOLIN_EMAIL && PANGOLIN_PASSWORD);
const pangolinDiscovery =
  PANGOLIN_API_URL && PANGOLIN_ORG_ID && hasPangolinAuth
    ? createPangolinDiscovery({
        apiUrl: PANGOLIN_API_URL,
        orgId: PANGOLIN_ORG_ID,
        ...(PANGOLIN_API_KEY && { apiKey: PANGOLIN_API_KEY }),
        ...(PANGOLIN_EMAIL && { email: PANGOLIN_EMAIL }),
        ...(PANGOLIN_PASSWORD && { password: PANGOLIN_PASSWORD }),
      })
    : null;
const workerRegistry = createWorkerRegistry();
const k8sDiscovery = createK8sDiscovery();
const staticUrls = WORKER_URL ? [WORKER_URL] : [];
const staticDiscovery = createStaticDiscovery(staticUrls);

const discovery = {
  async getWorkers() {
    // Pangolin tunnel discovery (primary when configured)
    if (pangolinDiscovery) {
      const pangolinWorkers = await pangolinDiscovery.getWorkers();
      if (pangolinWorkers.length > 0) return pangolinWorkers;
    }

    // Call-home registry (legacy WebSocket connection)
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

const DATA_DIR = process.env['DATA_DIR'] ?? '/var/lib/paws/data';
const db = createDatabase(`${DATA_DIR}/paws.db`);

const app = await createControlPlaneApp({
  apiKey: API_KEY,
  db,
  discovery,
  workerRegistry,
  upgradeWebSocket,
  ...(DASHBOARD_DIR && { dashboardDir: DASHBOARD_DIR }),
  ...(oidc && { oidc }),
  ...(pangolinDiscovery && { pangolinStatus: () => pangolinDiscovery.status() }),
});

// --- Auto-register Dex as Pangolin OIDC provider (if both configured) ---
const PANGOLIN_OIDC_SECRET = process.env['PANGOLIN_OIDC_SECRET'] ?? '';

if (
  pangolinDiscovery &&
  PANGOLIN_API_URL &&
  PANGOLIN_ORG_ID &&
  OIDC_ISSUER &&
  PANGOLIN_OIDC_SECRET
) {
  void (async () => {
    try {
      const { createPangolinAdmin } = await import('./pangolin-admin.js');
      const admin = createPangolinAdmin({
        apiUrl: PANGOLIN_API_URL,
        apiKey: PANGOLIN_API_KEY || undefined,
        email: PANGOLIN_EMAIL || undefined,
        password: PANGOLIN_PASSWORD || undefined,
        orgId: PANGOLIN_ORG_ID,
      });

      // Check if Dex IdP already exists
      const existing = await admin.listIdps();
      const hasDex = existing.some(
        (idp) => idp.name === 'paws (Dex)' || idp.name.toLowerCase().includes('dex'),
      );

      if (!hasDex) {
        // Derive Dex URLs from the OIDC issuer (e.g., https://fleet.tpops.dev/dex)
        const issuerBase = OIDC_ISSUER.replace(/\/$/, '');
        await admin.createOidcIdp({
          name: 'paws (Dex)',
          clientId: 'pangolin',
          clientSecret: PANGOLIN_OIDC_SECRET,
          authUrl: `${issuerBase}/auth`,
          tokenUrl: `${issuerBase}/token`,
          scopes: 'openid profile email',
          emailPath: 'email',
          namePath: 'name',
          identifierPath: 'sub',
        });
        console.log('pangolin: auto-registered Dex as OIDC identity provider');
      }
    } catch (err) {
      // Non-fatal — Pangolin might not be ready yet on first boot
      console.warn('pangolin: failed to auto-register Dex IdP (will retry on next restart):', err);
    }
  })();
}

// --- Autoscaler ---
const AUTOSCALE_ENABLED = process.env['AUTOSCALE_ENABLED'] === 'true';
const AUTOSCALE_PROVIDER = process.env['AUTOSCALE_PROVIDER'] ?? 'hetzner-cloud';
const AUTOSCALE_MIN_WORKERS = parseInt(process.env['AUTOSCALE_MIN_WORKERS'] ?? '1', 10);
const AUTOSCALE_MAX_WORKERS = parseInt(process.env['AUTOSCALE_MAX_WORKERS'] ?? '10', 10);
const AUTOSCALE_WORKER_PLAN = process.env['AUTOSCALE_WORKER_PLAN'] ?? 'cx31';
const AUTOSCALE_WORKER_REGION = process.env['AUTOSCALE_WORKER_REGION'] ?? 'fsn1';

let autoscalerStatus = 'disabled';

if (AUTOSCALE_ENABLED) {
  try {
    const { createAutoscaler } = await import('./autoscaler.js');

    // Dynamically load the provider based on AUTOSCALE_PROVIDER
    let provider: import('@paws/providers').HostProvider | null = null;

    if (AUTOSCALE_PROVIDER === 'hetzner-cloud') {
      const { createHetznerCloudProvider } = await import('@paws/provider-hetzner-cloud');
      const hcloudToken = process.env['HCLOUD_TOKEN'] ?? '';
      if (hcloudToken) {
        provider = createHetznerCloudProvider({
          token: hcloudToken,
        }) as unknown as import('@paws/providers').HostProvider;
      }
    } else if (AUTOSCALE_PROVIDER === 'aws-ec2') {
      try {
        const { createAwsEc2Provider } = await import('@paws/provider-aws-ec2');
        provider = createAwsEc2Provider({
          region: process.env['AWS_REGION'] ?? 'us-east-1',
          defaultImageId: process.env['AWS_AMI_ID'] ?? '',
          credentials: {
            accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? '',
            secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? '',
          },
        }) as unknown as import('@paws/providers').HostProvider;
      } catch {
        console.warn('[autoscaler] AWS EC2 provider not available');
      }
    }

    if (provider) {
      const scaler = createAutoscaler({
        provider,
        discovery,
        registry: workerRegistry,
        minWorkers: AUTOSCALE_MIN_WORKERS,
        maxWorkers: AUTOSCALE_MAX_WORKERS,
        scaleUpThreshold: 0.8,
        scaleDownThreshold: 0.2,
        scaleDownDelayMs: 300_000,
        cooldownMs: 120_000,
        pollIntervalMs: 30_000,
        workerPlan: AUTOSCALE_WORKER_PLAN,
        workerRegion: AUTOSCALE_WORKER_REGION,
        gatewayUrl: oidc?.externalUrl ?? `http://localhost:${PORT}`,
        apiKey: API_KEY,
      });
      scaler.start();
      autoscalerStatus = `${AUTOSCALE_PROVIDER} (${AUTOSCALE_MIN_WORKERS}-${AUTOSCALE_MAX_WORKERS} workers)`;
    } else {
      autoscalerStatus = 'no provider configured';
    }
  } catch (err) {
    console.error('[autoscaler] Failed to start:', err);
    autoscalerStatus = 'error';
  }
}

const discoveryMode = [];
if (pangolinDiscovery) discoveryMode.push('pangolin');
discoveryMode.push('call-home');
if (WORKER_URL) discoveryMode.push(`static (${WORKER_URL})`);
discoveryMode.push('k8s');

console.log(`
 /\\_/\\
( o.o )  paws control-plane
 > ^ <

Listening on :${PORT}
Worker discovery: ${discoveryMode.join(' + ')}
Auth: ${oidc ? `OIDC (${OIDC_ISSUER})` : 'API key only'}
Autoscaler: ${autoscalerStatus}
Dashboard: ${DASHBOARD_DIR ? `serving from ${DASHBOARD_DIR}` : 'disabled (set DASHBOARD_DIR)'}
OpenAPI spec: http://localhost:${PORT}/openapi.json
`);

export default {
  port: PORT,
  fetch: app.fetch,
  websocket,
};
