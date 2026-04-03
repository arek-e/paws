import type { ResultAsync } from 'neverthrow';

import type { RuntimeError } from './errors.js';

/** Capabilities declared by a runtime adapter */
export interface RuntimeCapabilities {
  /** Can run arbitrary Linux binaries (compilers, Docker, etc.) */
  fullLinux: boolean;
  /** Uses hardware-level isolation (KVM) */
  hardwareIsolation: boolean;
  /** Injects credentials transparently at network layer (MITM proxy) */
  transparentCredentialInjection: boolean;
  /** Approximate cold start time in milliseconds */
  coldStartMs: number;
  /** Max concurrent sessions this runtime supports */
  maxConcurrentSessions: number;
}

/** Resolved credentials ready for injection */
export interface ResolvedCredentials {
  /** Domain -> headers to inject */
  domains: Record<string, { headers: Record<string, string>; target?: string }>;
  /** Domains allowed without credentials */
  allowlist: string[];
}

/** Result of a completed session */
export interface SessionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  output?: unknown;
  durationMs: number;
  exposedPorts?: ExposedPortResult[];
}

/** A port exposed during session execution */
export interface ExposedPortResult {
  port: number;
  url: string;
  label?: string;
  access?: string;
  pin?: string;
  shareLink?: string;
}

/** Options for session execution */
export interface ExecuteOptions {
  signal?: AbortSignal;
  onStatusChange?: (status: string) => void;
  portExposure?: PortExposureProvider;
}

/** Provider for exposing ports from the runtime to the outside world */
export interface PortExposureProvider {
  expose(
    sessionId: string,
    ports: Array<{ port: number; protocol?: string; label?: string }>,
    hostPorts: number[],
  ): Promise<ExposedPortResult[]>;
  cleanup(sessionId: string, tunnels: ExposedPortResult[]): Promise<void>;
}

/** Session execution request (runtime-agnostic subset of CreateSessionRequest) */
export interface RuntimeSessionRequest {
  /** Snapshot/image identifier */
  snapshot: string;
  /** Workload to execute */
  workload: {
    type: string;
    script: string;
    env: Record<string, string>;
  };
  /** Resource allocation */
  resources?: {
    vcpus: number;
    memoryMB: number;
  };
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Port exposure requests */
  exposePorts?: Array<{
    port: number;
    protocol?: string;
    label?: string;
    access?: string;
    allowedEmails?: string[];
  }>;
  /** Host path to a persistent state volume. Mounted at /state inside the runtime. */
  stateVolumePath?: string;
}

/**
 * Runtime adapter interface.
 *
 * Each adapter owns the full session lifecycle: network setup, credential injection,
 * VM/container/isolate management, workload execution, result collection, and cleanup.
 *
 * Cleanup MUST be guaranteed even on failure (use finally blocks).
 */
export interface RuntimeAdapter {
  /** Unique runtime name (e.g., 'firecracker', 'agent-os', 'docker') */
  readonly name: string;

  /** Capabilities this runtime provides */
  readonly capabilities: RuntimeCapabilities;

  /**
   * Execute a session from start to finish.
   *
   * @param sessionId - Unique session identifier
   * @param request - Runtime-agnostic session request
   * @param credentials - Resolved credentials for injection
   * @param options - Optional execution options (abort signal, port exposure)
   * @returns Session result or error
   */
  execute(
    sessionId: string,
    request: RuntimeSessionRequest,
    credentials: ResolvedCredentials,
    options?: ExecuteOptions,
  ): ResultAsync<SessionResult, RuntimeError>;

  /**
   * Get connection info for a running session (guest IP, SSH key path).
   * Used by the worker to proxy browser actions, port exposure, etc.
   * Returns undefined if the session is not running or the runtime doesn't support it.
   */
  getSessionConnection?(sessionId: string): SessionConnection | undefined;

  /** Release all resources held by this runtime */
  dispose(): Promise<void>;
}

/** Connection info for interacting with a running session's environment */
export interface SessionConnection {
  /** Guest IP address (e.g., 172.16.0.2 for Firecracker TAP) */
  guestIp: string;
  /** Path to SSH private key for VM access */
  sshKeyPath: string;
}
