/** Injected exec function for testability */
export type ExecFn = (
  cmd: string,
  args: readonly string[],
) => Promise<{ stdout: string; stderr: string }>;

/** Per-domain configuration */
export interface DomainEntry {
  /** Credential headers to inject for this domain */
  headers?: Record<string, string>;
  /** Override upstream URL (for testing); omit to connect to real domain via SNI/Host */
  target?: string;
}

/** Configuration for the credential injection proxy */
export interface ProxyConfig {
  /** Host and port to listen on */
  listen: { host: string; port: number };
  /** Domain allowlist with optional credential injection */
  domains: Record<string, DomainEntry>;
  /** PEM-encoded CA cert + key for TLS MITM; auto-generated if omitted */
  ca?: { cert: string; key: string };
  /** Session ID for audit log correlation */
  sessionId?: string;
}

/** Handle to a running proxy instance */
export interface ProxyInstance {
  /** Start listening */
  start(): Promise<void>;
  /** Stop the proxy */
  stop(): Promise<void>;
  /** Get the actual listen address */
  address(): { host: string; port: number };
  /** Get the active CA cert and key (PEM strings) */
  ca(): { cert: string; key: string };
}
