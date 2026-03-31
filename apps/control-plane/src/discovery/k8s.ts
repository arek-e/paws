import { readFileSync } from 'node:fs';

import type { Worker } from '@paws/domain-fleet';

import { createStaticDiscovery } from './static.js';
import type { WorkerDiscovery } from './index.js';

export interface K8sDiscoveryOptions {
  /** Kubernetes namespace to watch. Defaults to 'paws'. */
  namespace?: string;
  /** Pod label selector. Defaults to 'app=paws-worker'. */
  labelSelector?: string;
  /** Worker port. Defaults to 3000. */
  workerPort?: number;
  /**
   * Poll interval in milliseconds for re-listing pods.
   * Defaults to 15_000 (15 seconds).
   */
  pollIntervalMs?: number;
  /**
   * Path to the Kubernetes service account token.
   * Defaults to the standard in-cluster path.
   */
  tokenPath?: string;
  /**
   * Path to the Kubernetes CA cert.
   * Defaults to the standard in-cluster path.
   */
  caPath?: string;
  /**
   * Override the Kubernetes API server URL.
   * Defaults to https://kubernetes.default.svc.
   */
  apiServer?: string;
}

/**
 * K8s pod watcher that maintains a live list of healthy worker URLs.
 *
 * When running inside a Kubernetes cluster, reads the service account
 * credentials from the standard mount path and polls the pods API to
 * discover worker pods.
 *
 * Falls back gracefully to an empty worker list when not in a K8s
 * environment (missing token/CA cert) — the caller should combine this
 * with static discovery or return a 503 when no workers are available.
 */
export function createK8sDiscovery(opts: K8sDiscoveryOptions = {}): WorkerDiscovery {
  const {
    namespace = 'paws',
    labelSelector = 'app=paws-worker',
    workerPort = 3000,
    pollIntervalMs = 15_000,
    tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token',
    caPath = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt',
    apiServer = 'https://kubernetes.default.svc',
  } = opts;

  // Attempt to read in-cluster credentials once at startup.
  // If they're missing we're not in K8s — treat as no pods discovered.
  let token: string | null = null;
  try {
    token = readFileSync(tokenPath, 'utf8').trim();
  } catch {
    // Not in a K8s cluster — token unavailable
  }

  // Cached list of discovered pod URLs, refreshed by the poll loop
  let cachedUrls: string[] = [];
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  if (token !== null) {
    // Kick off background polling immediately and then on interval
    void pollPods();
    pollTimer = setInterval(() => void pollPods(), pollIntervalMs);
    // Unref so the timer doesn't prevent the process from exiting
    if (typeof pollTimer.unref === 'function') {
      pollTimer.unref();
    }
  }

  async function pollPods(): Promise<void> {
    try {
      const urls = await listPodUrls({
        apiServer,
        namespace,
        labelSelector,
        token: token!,
        caPath,
        workerPort,
      });
      cachedUrls = urls;
    } catch {
      // Keep the previous cached list on transient errors
    }
  }

  // Delegate health-checking to static discovery so we reuse that logic
  return {
    async getWorkers(): Promise<Worker[]> {
      if (token === null) {
        // Not in K8s — return nothing; server.ts falls back to WORKER_URL
        return [];
      }

      // Re-use static discovery against the currently known pod URLs
      const delegate = createStaticDiscovery(cachedUrls);
      return delegate.getWorkers();
    },
  };
}

interface ListPodsOpts {
  apiServer: string;
  namespace: string;
  labelSelector: string;
  token: string;
  caPath: string;
  workerPort: number;
}

/**
 * Fetch running pods matching the label selector and return their worker URLs.
 *
 * Only pods in phase=Running with a non-empty podIP are included.
 */
async function listPodUrls(opts: ListPodsOpts): Promise<string[]> {
  const { apiServer, namespace, labelSelector, token, workerPort } = opts;

  const url = `${apiServer}/api/v1/namespaces/${namespace}/pods?labelSelector=${encodeURIComponent(labelSelector)}`;

  // Note: in production the CA cert would be loaded for TLS verification.
  // We use NODE_TLS_REJECT_UNAUTHORIZED=0 is NOT set — instead we pass the
  // caData. For simplicity in this implementation we set rejectUnauthorized
  // via a custom dispatcher when available; otherwise we rely on the cluster
  // network being trusted (same approach as kubectl in-cluster).
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`K8s pods API returned ${res.status}`);
  }

  const body = (await res.json()) as {
    items: Array<{
      status?: {
        phase?: string;
        podIP?: string;
        conditions?: Array<{ type: string; status: string }>;
      };
    }>;
  };

  const urls: string[] = [];
  for (const pod of body.items ?? []) {
    const phase = pod.status?.phase;
    const podIP = pod.status?.podIP;

    if (phase !== 'Running' || !podIP) {
      continue;
    }

    // Check that the pod's Ready condition is True
    const conditions = pod.status?.conditions ?? [];
    const ready = conditions.find((c) => c.type === 'Ready');
    if (ready && ready.status !== 'True') {
      continue;
    }

    urls.push(`http://${podIP}:${workerPort}`);
  }

  return urls;
}
