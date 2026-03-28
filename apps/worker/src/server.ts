import { createSessionApp } from './routes.js';
import { createExecutor } from './session/executor.js';
import { createSemaphore } from './semaphore.js';
import { createSyncLoop } from './sync/sync-loop.js';
import type { SyncLoop } from './sync/sync-loop.js';

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
const executor = createExecutor({
  snapshotDir: SNAPSHOT_DIR,
  vmBaseDir: VM_BASE_DIR,
  sshKeyPath: SSH_KEY_PATH,
  semaphore,
  workerName: WORKER_NAME,
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

const app = createSessionApp({ executor, semaphore, workerName: WORKER_NAME, syncLoop });

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
`);

export default {
  port: PORT,
  fetch: app.fetch,
};
