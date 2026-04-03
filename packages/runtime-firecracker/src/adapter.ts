import {
  createIpPool,
  createTap,
  deleteTap,
  restoreVm,
  setupIptables,
  setupInboundPort,
  stopVm,
  teardownIptables,
  teardownInboundPort,
} from '@paws/firecracker';
import type { FirecrackerAllocation, PortPool, VmHandle } from '@paws/firecracker';
import { createProxy, generateSessionCa } from '@paws/proxy';
import type { DomainEntry, ProxyInstance, SessionCa } from '@paws/proxy';
import { createLogger } from '@paws/logger';
import { RuntimeError, RuntimeErrorCode } from '@paws/runtime';
import type {
  RuntimeAdapter,
  RuntimeCapabilities,
  RuntimeSessionRequest,
  ResolvedCredentials,
  SessionResult,
  ExposedPortResult,
  ExecuteOptions,
} from '@paws/runtime';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';

import { sshExec, sshReadFile, sshWriteFile, waitForSsh } from './ssh.js';

const log = createLogger('runtime-firecracker');

/** Configuration for the Firecracker runtime adapter */
export interface FirecrackerRuntimeConfig {
  /** Path to default snapshot directory */
  snapshotDir: string;
  /** Base directory containing all snapshots (for multi-snapshot support) */
  snapshotBaseDir?: string;
  /** Base directory for VM working directories */
  vmBaseDir: string;
  /** Path to SSH private key for VM access */
  sshKeyPath: string;
  /** Max concurrent VMs (default: 5) */
  maxConcurrent?: number;
  /** Max IP pool slots (default: 256) */
  maxSlots?: number;
  /** Path to firecracker binary */
  firecrackerBin?: string;
  /** Port pool for inbound port exposure */
  portPool?: PortPool;
  /** Fallback worker URL when tunnels are not configured */
  workerExternalUrl?: string;
}

/** Active session tracking for the Firecracker runtime */
interface FirecrackerSession {
  sessionId: string;
  allocation?: FirecrackerAllocation;
  vmHandle?: VmHandle;
  proxyHandle?: ProxyInstance;
  ca?: SessionCa;
  inboundPorts?: Array<{ hostPort: number; guestPort: number }>;
  exposedPortResults?: ExposedPortResult[];
}

/**
 * Create a Firecracker runtime adapter.
 *
 * This adapter owns the full VM lifecycle:
 * 1. Allocate /30 subnet from IP pool
 * 2. Create TAP device
 * 3. Generate ephemeral session CA (ECDSA P-256)
 * 4. Setup iptables DNAT rules
 * 5. Spawn TLS MITM credential injection proxy
 * 6. Restore VM from Firecracker snapshot
 * 7. Wait for SSH
 * 8. Inject CA cert into VM trust store
 * 9. Setup port exposure (if requested)
 * 10. Write and execute workload script
 * 11. Collect results (stdout, stderr, exit code, structured output)
 * 12. Cleanup: stop VM, kill proxy, teardown network (guaranteed via finally)
 */
export function createFirecrackerRuntime(config: FirecrackerRuntimeConfig): RuntimeAdapter {
  const ipPool = createIpPool(config.maxSlots ?? 256);
  const activeSessions = new Map<string, FirecrackerSession>();

  return {
    name: 'firecracker',

    capabilities: {
      fullLinux: true,
      hardwareIsolation: true,
      transparentCredentialInjection: true,
      coldStartMs: 800,
      maxConcurrentSessions: config.maxConcurrent ?? 5,
    },

    execute(
      sessionId: string,
      request: RuntimeSessionRequest,
      credentials: ResolvedCredentials,
      options?: ExecuteOptions,
    ): ResultAsync<SessionResult, RuntimeError> {
      return ResultAsync.fromPromise(
        executeSession(config, ipPool, activeSessions, sessionId, request, credentials, options),
        (e) => {
          if (e instanceof RuntimeError) return e;
          return new RuntimeError(
            RuntimeErrorCode.EXECUTION_FAILED,
            `Session ${sessionId} failed: ${e instanceof Error ? e.message : String(e)}`,
            e,
          );
        },
      );
    },

    async dispose() {
      // Stop any lingering sessions
      for (const [sid, session] of activeSessions) {
        log.warn('Disposing lingering session', { sessionId: sid });
        await cleanupSession(config, ipPool, session);
      }
      activeSessions.clear();
    },
  };
}

/** Resolve a snapshot ID to a local directory path */
function resolveSnapshotDir(config: FirecrackerRuntimeConfig, snapshotId: string): string {
  if (config.snapshotBaseDir) {
    const resolved = `${config.snapshotBaseDir}/${snapshotId}`;
    try {
      const stat = Bun.file(`${resolved}/vmstate.snap`);
      if (stat.size > 0) return resolved;
    } catch {
      // Fall back to default
    }
  }
  return config.snapshotDir;
}

/** Build proxy domain config from resolved credentials */
function credentialsToDomains(credentials: ResolvedCredentials): Record<string, DomainEntry> {
  const domains: Record<string, DomainEntry> = {};

  for (const [domain, config] of Object.entries(credentials.domains)) {
    domains[domain] = {
      headers: config.headers,
      target: config.target,
    };
  }

  for (const domain of credentials.allowlist) {
    if (!(domain in domains)) {
      domains[domain] = {};
    }
  }

  return domains;
}

/** The main 12-step session execution choreography */
async function executeSession(
  config: FirecrackerRuntimeConfig,
  ipPool: ReturnType<typeof createIpPool>,
  activeSessions: Map<string, FirecrackerSession>,
  sessionId: string,
  request: RuntimeSessionRequest,
  credentials: ResolvedCredentials,
  options?: ExecuteOptions,
): Promise<SessionResult> {
  const startedAt = Date.now();
  const session: FirecrackerSession = { sessionId };
  activeSessions.set(sessionId, session);

  try {
    // 1. Allocate network (/30 subnet)
    const allocResult = ipPool.allocate();
    if (allocResult.isErr()) {
      throw new RuntimeError(
        RuntimeErrorCode.CAPACITY_EXHAUSTED,
        `IP pool exhausted: ${allocResult.error.message}`,
        allocResult.error,
      );
    }
    session.allocation = allocResult.value;

    const vmDir = `${config.vmBaseDir}/${sessionId}`;

    // 2. Create TAP device
    const tapResult = await createTap(session.allocation);
    if (tapResult.isErr()) {
      throw new RuntimeError(
        RuntimeErrorCode.NETWORK_SETUP_FAILED,
        `TAP creation failed: ${tapResult.error.message}`,
        tapResult.error,
      );
    }

    // 3. Generate session CA
    const caResult = await generateSessionCa({ dir: `${vmDir}/ca` });
    if (caResult.isErr()) {
      throw new RuntimeError(
        RuntimeErrorCode.CA_GENERATION_FAILED,
        `CA generation failed: ${caResult.error.message}`,
        caResult.error,
      );
    }
    session.ca = caResult.value;

    // 4. Setup iptables rules
    const iptResult = await setupIptables(session.allocation);
    if (iptResult.isErr()) {
      throw new RuntimeError(
        RuntimeErrorCode.NETWORK_SETUP_FAILED,
        `iptables setup failed: ${iptResult.error.message}`,
        iptResult.error,
      );
    }

    // 5. Spawn TLS proxy
    session.proxyHandle = createProxy({
      listen: { host: session.allocation.hostIp, port: 8080 },
      domains: credentialsToDomains(credentials),
      ca: { cert: session.ca.cert, key: session.ca.key },
    });
    await session.proxyHandle.start();

    // 6. Restore VM from snapshot
    const snapshotDir = resolveSnapshotDir(config, request.snapshot);
    const restoreResult = await restoreVm({
      snapshotDir,
      vmDir,
      ...(config.firecrackerBin ? { firecrackerBin: config.firecrackerBin } : {}),
    });
    if (restoreResult.isErr()) {
      throw new RuntimeError(
        RuntimeErrorCode.VM_RESTORE_FAILED,
        `VM restore failed: ${restoreResult.error.message}`,
        restoreResult.error,
      );
    }
    session.vmHandle = restoreResult.value;

    // 7. Wait for SSH
    const sshOpts = {
      host: session.allocation.guestIp,
      keyPath: config.sshKeyPath,
    };

    const sshResult = await waitForSsh(sshOpts);
    if (sshResult.isErr()) {
      throw new RuntimeError(
        RuntimeErrorCode.SSH_FAILED,
        `SSH wait failed: ${sshResult.error.message}`,
        sshResult.error,
      );
    }

    // 8. Inject CA cert into VM trust store
    const injectCaResult = await sshWriteFile(
      sshOpts,
      '/usr/local/share/ca-certificates/paws-session.crt',
      session.ca.cert,
    );
    if (injectCaResult.isErr()) {
      throw new RuntimeError(
        RuntimeErrorCode.SSH_FAILED,
        `CA injection failed: ${injectCaResult.error.message}`,
        injectCaResult.error,
      );
    }

    const updateCaResult = await sshExec(sshOpts, 'update-ca-certificates 2>/dev/null || true');
    if (updateCaResult.isErr()) {
      throw new RuntimeError(
        RuntimeErrorCode.SSH_FAILED,
        `CA update failed: ${updateCaResult.error.message}`,
        updateCaResult.error,
      );
    }

    // 9. Setup port exposure (if configured)
    const exposePorts = request.exposePorts ?? [];
    let exposedPortResults: ExposedPortResult[] | undefined;

    if (exposePorts.length > 0 && config.portPool) {
      const portResult = config.portPool.allocate(exposePorts.length);
      if (portResult.isErr()) {
        throw new RuntimeError(
          RuntimeErrorCode.CAPACITY_EXHAUSTED,
          `Port allocation failed: ${portResult.error.message}`,
          portResult.error,
        );
      }
      const hostPorts = portResult.value;
      session.inboundPorts = exposePorts.map((ep, i) => ({
        hostPort: hostPorts[i]!,
        guestPort: ep.port,
      }));

      for (const mapping of session.inboundPorts) {
        const iptRes = await setupInboundPort(
          session.allocation,
          mapping.hostPort,
          mapping.guestPort,
        );
        if (iptRes.isErr()) {
          throw new RuntimeError(
            RuntimeErrorCode.NETWORK_SETUP_FAILED,
            `Inbound iptables failed: ${iptRes.error.message}`,
            iptRes.error,
          );
        }
      }

      // Port exposure via provider or direct URLs
      if (options?.portExposure) {
        const tunnelResults = await options.portExposure.expose(sessionId, exposePorts, hostPorts);
        exposedPortResults = tunnelResults;
        session.exposedPortResults = tunnelResults;
      } else if (config.workerExternalUrl) {
        exposedPortResults = exposePorts.map((ep, i) => ({
          port: ep.port,
          url: `${config.workerExternalUrl}:${hostPorts[i]}`,
          label: ep.label,
        }));
      }
    }

    // 10. Write and execute workload script
    const envExports = Object.entries(request.workload.env)
      .map(([k, v]) => `export ${k}=${shellEscape(v)}`)
      .join('\n');

    const script = ['#!/bin/bash', 'set -euo pipefail', envExports, request.workload.script].join(
      '\n',
    );

    const writeResult = await sshWriteFile(sshOpts, '/tmp/workload.sh', script);
    if (writeResult.isErr()) {
      throw new RuntimeError(
        RuntimeErrorCode.SSH_FAILED,
        `Script write failed: ${writeResult.error.message}`,
        writeResult.error,
      );
    }

    await sshExec(sshOpts, 'chmod +x /tmp/workload.sh');

    const timeoutSecs = Math.ceil(request.timeoutMs / 1000);
    const execResult = await sshExec(
      sshOpts,
      `timeout ${timeoutSecs} /tmp/workload.sh 2>/tmp/stderr.log || echo "EXIT:$?" > /tmp/exit_code`,
    );

    // 11. Collect results
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    let output: unknown = undefined;

    if (execResult.isOk()) {
      stdout = execResult.value.stdout;
    }

    const stderrResult = await sshReadFile(sshOpts, '/tmp/stderr.log');
    if (stderrResult.isOk()) {
      stderr = stderrResult.value;
    }

    const exitCodeResult = await sshReadFile(sshOpts, '/tmp/exit_code');
    if (exitCodeResult.isOk()) {
      const match = exitCodeResult.value.match(/EXIT:(\d+)/);
      if (match?.[1]) {
        exitCode = parseInt(match[1], 10);
      }
    }

    const outputResult = await sshReadFile(sshOpts, '/output/result.json');
    if (outputResult.isOk()) {
      try {
        output = JSON.parse(outputResult.value);
      } catch {
        // Not valid JSON — ignore
      }
    }

    const durationMs = Date.now() - startedAt;

    return { exitCode, stdout, stderr, output, durationMs, exposedPorts: exposedPortResults };
  } finally {
    // 12. Cleanup — always runs
    await cleanupSession(config, ipPool, session);
    activeSessions.delete(sessionId);
  }
}

/** Cleanup all resources for a session */
async function cleanupSession(
  config: FirecrackerRuntimeConfig,
  ipPool: ReturnType<typeof createIpPool>,
  session: FirecrackerSession,
): Promise<void> {
  // Clean up inbound iptables rules and release host ports
  if (session.inboundPorts?.length && session.allocation) {
    for (const mapping of session.inboundPorts) {
      await teardownInboundPort(session.allocation, mapping.hostPort, mapping.guestPort);
    }
    if (config.portPool) {
      config.portPool.release(session.inboundPorts.map((m) => m.hostPort));
    }
  }

  if (session.vmHandle) {
    await stopVm(session.vmHandle);
  }

  if (session.proxyHandle) {
    await session.proxyHandle.stop();
  }

  if (session.allocation) {
    await teardownIptables(session.allocation);
    await deleteTap(session.allocation.tapDevice);
    ipPool.release(session.allocation.subnetIndex);
  }
}

/** Escape a value for safe shell interpolation */
function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
