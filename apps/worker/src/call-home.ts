import { createLogger } from '@paws/logger';

const log = createLogger('call-home');

export interface CallHomeOpts {
  gatewayUrl: string;
  apiKey: string;
  workerName: string;
  workerUrl: string;
  /** paws version running on this worker */
  version?: string | undefined;
  healthFn: () => {
    status: string;
    capacity: { maxConcurrent: number; running: number; queued: number; available: number };
    uptime: number;
    snapshot?: { id: string; version: number; ageMs: number };
  };
  intervalMs?: number;
}

export interface CallHome {
  start(): void;
  stop(): void;
}

export function createCallHome(opts: CallHomeOpts): CallHome {
  const { gatewayUrl, apiKey, workerName, workerUrl, healthFn, intervalMs = 10_000 } = opts;

  let ws: WebSocket | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1_000;
  let stopped = false;

  function getWsUrl(): string {
    const base = gatewayUrl.replace(/^http/, 'ws');
    const params = new URLSearchParams({
      token: apiKey,
      name: workerName,
      url: workerUrl,
    });
    return `${base}/v1/workers/register?${params}`;
  }

  function sendHeartbeat() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const health = healthFn();
    ws.send(
      JSON.stringify({
        type: 'heartbeat',
        status: health.status,
        capacity: health.capacity,
        uptime: health.uptime,
        snapshot: health.snapshot ?? { id: 'default', version: 0, ageMs: 0 },
        version: opts.version ?? '0.0.0',
      }),
    );
  }

  function connect() {
    if (stopped) return;

    const url = getWsUrl();
    log.info('Connecting to gateway', { gatewayUrl });

    try {
      ws = new WebSocket(url);
    } catch (err) {
      log.error('Failed to create WebSocket', {
        error: err instanceof Error ? err.message : String(err),
      });
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      log.info('Connected to gateway');
      reconnectDelay = 1_000; // reset backoff

      // Send first heartbeat immediately
      sendHeartbeat();

      // Start periodic heartbeats
      heartbeatTimer = setInterval(sendHeartbeat, intervalMs);
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === 'registered') {
          log.info('Registered', { name: data.name });
        }
      } catch {
        // Ignore
      }
    };

    ws.onclose = () => {
      cleanup();
      if (!stopped) {
        log.info('Disconnected, reconnecting', { delayMs: reconnectDelay });
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }

  function cleanup() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    ws = null;
  }

  function scheduleReconnect() {
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
      connect();
    }, reconnectDelay);
  }

  return {
    start() {
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (ws) {
        ws.close();
        ws = null;
      }
    },
  };
}
