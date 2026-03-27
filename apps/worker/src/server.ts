import { createSessionApp } from './routes.js';
import { createExecutor } from './session/executor.js';
import { createSemaphore } from './semaphore.js';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const MAX_CONCURRENT = parseInt(process.env['MAX_CONCURRENT_VMS'] ?? '5', 10);
const MAX_QUEUED = parseInt(process.env['MAX_QUEUE_SIZE'] ?? '10', 10);
const SNAPSHOT_DIR = process.env['SNAPSHOT_DIR'] ?? '/var/lib/paws/snapshots/agent-latest';
const VM_BASE_DIR = process.env['VM_BASE_DIR'] ?? '/var/lib/paws/vms';
const SSH_KEY_PATH = process.env['SSH_KEY_PATH'] ?? '/var/lib/paws/ssh/id_ed25519';
const WORKER_NAME = process.env['WORKER_NAME'] ?? `worker-${process.pid}`;

const semaphore = createSemaphore(MAX_CONCURRENT, MAX_QUEUED);
const executor = createExecutor({
  snapshotDir: SNAPSHOT_DIR,
  vmBaseDir: VM_BASE_DIR,
  sshKeyPath: SSH_KEY_PATH,
  semaphore,
  workerName: WORKER_NAME,
});

const app = createSessionApp({ executor, semaphore, workerName: WORKER_NAME });

console.log(`
 /\\_/\\
( o.o )  paws worker
 > ^ <

Listening on :${PORT}
Max concurrent VMs: ${MAX_CONCURRENT}
Max queued: ${MAX_QUEUED}
Snapshot: ${SNAPSHOT_DIR}
Worker: ${WORKER_NAME}
`);

export default {
  port: PORT,
  fetch: app.fetch,
};
