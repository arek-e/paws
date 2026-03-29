import { createPortPool } from '@paws/firecracker';

import { createCallHome } from './call-home.js';
import { createSessionApp } from './routes.js';
import { createExecutor } from './session/executor.js';
import { createSemaphore } from './semaphore.js';
import { createSyncLoop } from './sync/sync-loop.js';
import type { SyncLoop } from './sync/sync-loop.js';
import { createPangolinResourceManager } from './tunnel/pangolin-resources.js';
import type { PangolinResourceManager } from './tunnel/pangolin-resources.js';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const MAX_CONCURRENT = parseInt(process.env['MAX_CONCURRENT_VMS'] ?? '5', 10);
const MAX_QUEUED = parseInt(process.env['MAX_QUEUE_SIZE'] ?? '10', 10);
const SNAPSHOT_DIR = process.env['SNAPSHOT_DIR'] ?? '/var/lib/paws/snapshots/agent-latest';
const VM_BASE_DIR = process.env['VM_BASE_DIR'] ?? '/var/lib/paws/vms';
const SSH_KEY_PATH = process.env['SSH_KEY_PATH'] ?? '/var/lib/paws/ssh/id_ed25519';
const WORKER_NAME = process.env['WORKER_NAME'] ?? `worker-${process.pid}`;

const SNAPSHOT_SYNC_ENABLED = process.env['SNAPSHOT_SYNC_ENABLED'] === 'true';
const R2_ENDPOINT = process.env['R2_ENDPOINT'] ?? '';
const R2_ACCESS_KEY_ID = process.env['R2_ACCESS_KEY_ID'] ?? '';
const R2_SECRET_ACCESS_KEY = process.env['R2_SECRET_ACCESS_KEY'] ?? '';
const R2_BUCKET_NAME = process.env['R2_BUCKET_NAME'] ?? '';
const SNAPSHOT_SYNC_INTERVAL_MS = parseInt(
  process.env['SNAPSHOT_SYNC_INTERVAL_MS'] ?? '300000',
  10,
);

const semaphore = createSemaphore(MAX_CONCURRENT, MAX_QUEUED);
const SNAPSHOT_BASE_DIR = process.env['SNAPSHOT_BASE_DIR'] ?? '/var/lib/paws/snapshots';

// Port exposure configuration (optional)
const PANGOLIN_API_URL_WORKER = process.env['PANGOLIN_API_URL'] ?? '';
const PANGOLIN_API_KEY_WORKER = process.env['PANGOLIN_API_KEY'] ?? '';
const PANGOLIN_EMAIL_WORKER = process.env['PANGOLIN_EMAIL'] ?? '';
const PANGOLIN_PASSWORD_WORKER = process.env['PANGOLIN_PASSWORD'] ?? '';
const PANGOLIN_ORG_ID_WORKER = process.env['PANGOLIN_ORG_ID'] ?? '';
const PANGOLIN_SITE_ID = process.env['PANGOLIN_SITE_ID'] ?? '';
const PANGOLIN_DOMAIN_ID = process.env['PANGOLIN_DOMAIN_ID'] ?? '';
const PANGOLIN_BASE_DOMAIN = process.env['PANGOLIN_BASE_DOMAIN'] ?? '';
const WORKER_EXTERNAL_URL = process.env['WORKER_EXTERNAL_URL'] ?? '';

let pangolinResources: PangolinResourceManager | undefined;
const portPool = createPortPool();

if (PANGOLIN_API_URL_WORKER && PANGOLIN_ORG_ID_WORKER && PANGOLIN_SITE_ID && PANGOLIN_BASE_DOMAIN) {
  pangolinResources = createPangolinResourceManager({
    apiUrl: PANGOLIN_API_URL_WORKER,
    apiKey: PANGOLIN_API_KEY_WORKER || undefined,
    email: PANGOLIN_EMAIL_WORKER || undefined,
    password: PANGOLIN_PASSWORD_WORKER || undefined,
    orgId: PANGOLIN_ORG_ID_WORKER,
    siteId: PANGOLIN_SITE_ID,
    domainId: PANGOLIN_DOMAIN_ID,
    baseDomain: PANGOLIN_BASE_DOMAIN,
  });
}

// LLM gateway plugin (optional — routes LLM API calls through an external proxy)
const LLM_GATEWAY_NAME = process.env['LLM_GATEWAY'] ?? '';
const LLM_GATEWAY_URL = process.env['LLM_GATEWAY_URL'] ?? '';
const LLM_GATEWAY_KEY = process.env['LLM_GATEWAY_KEY'] ?? '';

// Built-in gateway presets
const GATEWAY_PRESETS: Record<string, { url: string; domains: string[] }> = {
  litellm: {
    url: LLM_GATEWAY_URL || 'http://litellm:4001',
    domains: ['api.anthropic.com', 'api.openai.com'],
  },
  openrouter: {
    url: LLM_GATEWAY_URL || 'https://openrouter.ai/api',
    domains: ['api.anthropic.com', 'api.openai.com'],
  },
  custom: {
    url: LLM_GATEWAY_URL,
    domains: (process.env['LLM_GATEWAY_DOMAINS'] ?? 'api.anthropic.com,api.openai.com')
      .split(',')
      .map((d) => d.trim()),
  },
};

const llmGateway =
  LLM_GATEWAY_NAME && LLM_GATEWAY_KEY
    ? {
        name: LLM_GATEWAY_NAME,
        url: GATEWAY_PRESETS[LLM_GATEWAY_NAME]?.url ?? LLM_GATEWAY_URL,
        apiKey: LLM_GATEWAY_KEY,
        domains: GATEWAY_PRESETS[LLM_GATEWAY_NAME]?.domains ?? GATEWAY_PRESETS['custom']!.domains,
      }
    : undefined;

const executor = createExecutor({
  snapshotDir: SNAPSHOT_DIR,
  snapshotBaseDir: SNAPSHOT_BASE_DIR,
  vmBaseDir: VM_BASE_DIR,
  sshKeyPath: SSH_KEY_PATH,
  semaphore,
  workerName: WORKER_NAME,
  portPool,
  pangolinResources,
  workerExternalUrl: WORKER_EXTERNAL_URL || undefined,
  llmGateway,
});

let syncLoop: SyncLoop | undefined;

if (SNAPSHOT_SYNC_ENABLED) {
  const { createSnapshotStore } = await import('@paws/snapshot-store');
  const store = createSnapshotStore({
    endpoint: R2_ENDPOINT,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET_NAME,
  });

  syncLoop = createSyncLoop({
    store,
    snapshotId: 'agent-latest',
    localDir: SNAPSHOT_DIR,
    pollIntervalMs: SNAPSHOT_SYNC_INTERVAL_MS,
    tempDir: `${SNAPSHOT_DIR}/../.downloading`,
  });

  syncLoop.start();
  console.log('Snapshot sync: enabled (polling every %dms)', SNAPSHOT_SYNC_INTERVAL_MS);
}

const app = createSessionApp({
  executor,
  semaphore,
  workerName: WORKER_NAME,
  syncLoop,
  snapshotBuilderConfig: {
    snapshotBaseDir: SNAPSHOT_BASE_DIR,
    outputDir: SNAPSHOT_BASE_DIR,
    sshKeyPath: SSH_KEY_PATH,
  },
});
const startTime = Date.now();

// Call-home: register with gateway via WebSocket
const GATEWAY_URL = process.env['GATEWAY_URL'] ?? '';
const API_KEY = process.env['API_KEY'] ?? '';
const WORKER_URL = process.env['WORKER_URL'] ?? `http://localhost:${PORT}`;

if (GATEWAY_URL && API_KEY) {
  const callHome = createCallHome({
    gatewayUrl: GATEWAY_URL,
    apiKey: API_KEY,
    workerName: WORKER_NAME,
    workerUrl: WORKER_URL,
    healthFn: () => ({
      status:
        semaphore.running === 0 && semaphore.queued === 0
          ? 'healthy'
          : semaphore.available > 0
            ? 'healthy'
            : 'degraded',
      capacity: {
        maxConcurrent: semaphore.running + semaphore.available,
        running: semaphore.running,
        queued: semaphore.queued,
        available: semaphore.available,
      },
      uptime: Date.now() - startTime,
    }),
  });
  callHome.start();
}

const portExposureStatus = pangolinResources
  ? `Pangolin (${PANGOLIN_BASE_DOMAIN})`
  : WORKER_EXTERNAL_URL
    ? `direct (${WORKER_EXTERNAL_URL})`
    : 'disabled';

console.log(`
 /\\_/\\
( o.o )  paws worker
 > ^ <

Listening on :${PORT}
Max concurrent VMs: ${MAX_CONCURRENT}
Max queued: ${MAX_QUEUED}
Snapshot: ${SNAPSHOT_DIR}
Worker: ${WORKER_NAME}
Snapshot sync: ${SNAPSHOT_SYNC_ENABLED ? 'enabled' : 'disabled'}
Port exposure: ${portExposureStatus}
LLM gateway: ${llmGateway ? `${llmGateway.name} (${llmGateway.url})` : 'direct (set LLM_GATEWAY + LLM_GATEWAY_KEY)'}
Call-home: ${GATEWAY_URL ? `${GATEWAY_URL}` : 'disabled (set GATEWAY_URL + API_KEY)'}
`);

export default {
  port: PORT,
  fetch: app.fetch,
};
