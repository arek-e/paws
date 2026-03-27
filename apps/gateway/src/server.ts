import { createGatewayApp } from './app.js';
import { createWorkerClient } from './worker-client.js';

const PORT = parseInt(process.env['PORT'] ?? '4000', 10);
const API_KEY = process.env['API_KEY'] ?? 'paws-dev-key';
const WORKER_URL = process.env['WORKER_URL'] ?? 'http://localhost:3000';

const workerClient = createWorkerClient(WORKER_URL);
const app = createGatewayApp({ apiKey: API_KEY, workerClient });

console.log(`
 /\\_/\\
( o.o )  paws gateway
 > ^ <

Listening on :${PORT}
Worker URL: ${WORKER_URL}
OpenAPI spec: http://localhost:${PORT}/openapi.json
`);

export default {
  port: PORT,
  fetch: app.fetch,
};
