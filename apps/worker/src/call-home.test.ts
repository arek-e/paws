import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// These tests require vi.advanceTimersByTimeAsync which is not available in
// Bun's test runner. They pass under `npx vitest`. Skipping under bun test.
const isBun = typeof globalThis.Bun !== 'undefined';

import { createCallHome } from './call-home.js';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((evt: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sentMessages: string[] = [];
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    // Simulate async open
    queueMicrotask(() => this.onopen?.());
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
    queueMicrotask(() => this.onclose?.());
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHealthFn() {
  return vi.fn().mockReturnValue({
    status: 'healthy',
    capacity: { maxConcurrent: 5, running: 2, queued: 0, available: 3 },
    uptime: 60000,
    snapshot: { id: 'agent-latest', version: 1, ageMs: 5000 },
  });
}

function defaultOpts(overrides: Record<string, unknown> = {}) {
  return {
    gatewayUrl: 'http://localhost:4000',
    apiKey: 'test-key',
    workerName: 'worker-01',
    workerUrl: 'http://localhost:3000',
    healthFn: makeHealthFn(),
    intervalMs: 100,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

(isBun ? describe.skip : describe)('createCallHome', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    (globalThis as Record<string, unknown>).WebSocket = MockWebSocket;
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns start and stop methods', () => {
    const callHome = createCallHome(defaultOpts());
    expect(typeof callHome.start).toBe('function');
    expect(typeof callHome.stop).toBe('function');
  });

  it('constructs WebSocket URL with params', async () => {
    const callHome = createCallHome(defaultOpts());
    callHome.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(MockWebSocket.instances).toHaveLength(1);
    const url = MockWebSocket.instances[0]!.url;
    expect(url).toContain('ws://localhost:4000/v1/workers/register');
    expect(url).toContain('token=test-key');
    expect(url).toContain('name=worker-01');
    expect(url).toContain('url=');

    callHome.stop();
  });

  it('converts http to ws in gateway URL', async () => {
    const callHome = createCallHome(defaultOpts({ gatewayUrl: 'https://gateway.example.com' }));
    callHome.start();
    await vi.advanceTimersByTimeAsync(0);

    const url = MockWebSocket.instances[0]!.url;
    expect(url).toContain('wss://gateway.example.com');

    callHome.stop();
  });

  it('sends heartbeat on connect', async () => {
    const healthFn = makeHealthFn();
    const callHome = createCallHome(defaultOpts({ healthFn }));
    callHome.start();
    await vi.advanceTimersByTimeAsync(0);

    const ws = MockWebSocket.instances[0]!;
    expect(ws.sentMessages).toHaveLength(1);

    const heartbeat = JSON.parse(ws.sentMessages[0]!);
    expect(heartbeat.type).toBe('heartbeat');
    expect(heartbeat.status).toBe('healthy');
    expect(heartbeat.capacity).toEqual({
      maxConcurrent: 5,
      running: 2,
      queued: 0,
      available: 3,
    });
    expect(healthFn).toHaveBeenCalledTimes(1);

    callHome.stop();
  });

  it('sends periodic heartbeats', async () => {
    const callHome = createCallHome(defaultOpts({ intervalMs: 50 }));
    callHome.start();
    await vi.advanceTimersByTimeAsync(0);

    const ws = MockWebSocket.instances[0]!;
    expect(ws.sentMessages).toHaveLength(1); // initial

    await vi.advanceTimersByTimeAsync(50);
    expect(ws.sentMessages).toHaveLength(2); // initial + 1

    await vi.advanceTimersByTimeAsync(50);
    expect(ws.sentMessages).toHaveLength(3); // initial + 2

    callHome.stop();
  });

  it('stop closes WebSocket and clears timers', async () => {
    const callHome = createCallHome(defaultOpts());
    callHome.start();
    await vi.advanceTimersByTimeAsync(0);

    const ws = MockWebSocket.instances[0]!;
    callHome.stop();

    expect(ws.readyState).toBe(3); // CLOSED

    // No new messages after stop
    const count = ws.sentMessages.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(ws.sentMessages).toHaveLength(count);
  });

  it('handles registered message', async () => {
    const callHome = createCallHome(defaultOpts());
    callHome.start();
    await vi.advanceTimersByTimeAsync(0);

    const ws = MockWebSocket.instances[0]!;
    // Should not throw
    ws.onmessage?.({ data: JSON.stringify({ type: 'registered', name: 'worker-01' }) });

    callHome.stop();
  });

  it('handles invalid JSON message without crashing', async () => {
    const callHome = createCallHome(defaultOpts());
    callHome.start();
    await vi.advanceTimersByTimeAsync(0);

    const ws = MockWebSocket.instances[0]!;
    // Should not throw
    ws.onmessage?.({ data: 'not json' });

    callHome.stop();
  });

  it('provides default snapshot when healthFn returns none', async () => {
    const healthFn = vi.fn().mockReturnValue({
      status: 'healthy',
      capacity: { maxConcurrent: 5, running: 0, queued: 0, available: 5 },
      uptime: 1000,
      // No snapshot
    });

    const callHome = createCallHome(defaultOpts({ healthFn }));
    callHome.start();
    await vi.advanceTimersByTimeAsync(0);

    const ws = MockWebSocket.instances[0]!;
    const heartbeat = JSON.parse(ws.sentMessages[0]!);
    expect(heartbeat.snapshot).toEqual({ id: 'default', version: 0, ageMs: 0 });

    callHome.stop();
  });
});
