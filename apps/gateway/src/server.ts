import { createGatewayApp } from './app.js';
import { createK8sDiscovery } from './discovery/k8s.js';
import { createStaticDiscovery } from './discovery/static.js';

const PORT = parseInt(process.env['PORT'] ?? '4000', 10);
const API_KEY = process.env['API_KEY'] ?? 'paws-dev-key';
const WORKER_URL = process.env['WORKER_URL'] ?? '';

// Use K8s pod-watching discovery when running in-cluster.
// Falls back to static discovery with WORKER_URL for local dev.
const k8sDiscovery = createK8sDiscovery();

// Check whether K8s credentials are available by attempting a getWorkers call.
// K8sDiscovery returns [] immediately when not in cluster (token missing).
// We compose: K8s first, then static fallback.
const staticUrls = WORKER_URL ? [WORKER_URL] : [];
const staticDiscovery = createStaticDiscovery(staticUrls);

// Combined discovery: prefer K8s workers, fall back to static list
const discovery = {
  async getWorkers() {
    const k8sWorkers = await k8sDiscovery.getWorkers();
    if (k8sWorkers.length > 0) {
      return k8sWorkers;
    }
    return staticDiscovery.getWorkers();
  },
};

const app = createGatewayApp({ apiKey: API_KEY, discovery });

const workerMode = WORKER_URL ? `static (${WORKER_URL})` : 'k8s pod-watch';

console.log(`
 /\\_/\\
( o.o )  paws gateway
 > ^ <

Listening on :${PORT}
Worker discovery: ${workerMode}
OpenAPI spec: http://localhost:${PORT}/openapi.json
`);

export default {
  port: PORT,
  fetch: app.fetch,
};
