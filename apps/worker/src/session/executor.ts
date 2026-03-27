import type { CreateSessionRequest, NetworkAllocation, NetworkConfig } from '@paws/types';
import {
  createIpPool,
  createTap,
  deleteTap,
  restoreVm,
  setupIptables,
  stopVm,
  teardownIptables,
} from '@paws/firecracker';
import type { VmHandle } from '@paws/firecracker';
import { createProxy, generateSessionCa } from '@paws/proxy';
import type { ProxyInstance, SessionCa } from '@paws/proxy';

import { WorkerError, WorkerErrorCode } from '../errors.js';
import { sshExec, sshReadFile, sshWriteFile, waitForSsh } from '../ssh/client.js';
import type { Semaphore } from '../semaphore.js';

/** Configuration for the session executor */
export interface ExecutorConfig {
  /** Path to snapshot directory */
  snapshotDir: string;
  /** Base directory for VM working directories */
  vmBaseDir: string;
  /** Path to SSH private key for VM access */
  sshKeyPath: string;
  /** Concurrency semaphore */
  semaphore: Semaphore;
  /** Max IP pool slots (default: 256) */
  maxSlots?: number;
  /** Path to firecracker binary */
  firecrackerBin?: string;
  /** Worker name for session tracking */
  workerName: string;
}

/** Result of a completed session */
export interface SessionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  output: unknown;
  durationMs: number;
}

/** Active session state for tracking */
export interface ActiveSession {
  sessionId: string;
  status: 'running' | 'stopping';
  startedAt: Date;
  allocation?: NetworkAllocation;
  vmHandle?: VmHandle;
  proxyHandle?: ProxyInstance;
  ca?: SessionCa;
}

/** Create the session executor that orchestrates the full VM lifecycle */
export function createExecutor(config: ExecutorConfig) {
  const ipPool = createIpPool(config.maxSlots ?? 256);
  const sessions = new Map<string, ActiveSession>();

  return {
    /**
     * Execute a session through the full VM lifecycle:
     * 1. Acquire semaphore slot
     * 2. Allocate network (/30 subnet)
     * 3. Create TAP device
     * 4. Generate session CA
     * 5. Setup iptables rules
     * 6. Spawn TLS proxy
     * 7. Restore VM from snapshot
     * 8. Wait for SSH
     * 9. Inject CA cert into VM trust store
     * 10. Write and execute workload script
     * 11. Collect results
     * 12. Cleanup (always runs): stop VM, kill proxy, teardown network
     */
    async execute(sessionId: string, request: CreateSessionRequest): Promise<SessionResult> {
      const startedAt = new Date();
      const network: NetworkConfig = request.network ?? { allowOut: [], credentials: {} };
      const session: ActiveSession = { sessionId, status: 'running', startedAt };
      sessions.set(sessionId, session);

      let allocation: NetworkAllocation | undefined;
      let vmHandle: VmHandle | undefined;
      let proxyHandle: ProxyInstance | undefined;
      let ca: SessionCa | undefined;

      try {
        // 1. Acquire semaphore slot
        await config.semaphore.acquire();

        // 2. Allocate network
        const allocResult = ipPool.allocate();
        if (allocResult.isErr()) {
          throw new WorkerError(
            WorkerErrorCode.CAPACITY_EXHAUSTED,
            allocResult.error.message,
            allocResult.error,
          );
        }
        allocation = allocResult.value;
        session.allocation = allocation;

        const vmDir = `${config.vmBaseDir}/${sessionId}`;

        // 3. Create TAP device
        const tapResult = await createTap(allocation);
        if (tapResult.isErr()) {
          throw new WorkerError(
            WorkerErrorCode.EXECUTION_FAILED,
            `TAP creation failed: ${tapResult.error.message}`,
            tapResult.error,
          );
        }

        // 4. Generate session CA
        const caResult = await generateSessionCa({ dir: `${vmDir}/ca` });
        if (caResult.isErr()) throw caResult.error;
        ca = caResult.value;
        session.ca = ca;

        // 5. Setup iptables rules
        const iptResult = await setupIptables(allocation);
        if (iptResult.isErr()) {
          throw new WorkerError(
            WorkerErrorCode.EXECUTION_FAILED,
            `iptables setup failed: ${iptResult.error.message}`,
            iptResult.error,
          );
        }

        // 6. Spawn TLS proxy
        proxyHandle = createProxy({
          listen: { host: allocation.hostIp, port: 8080 },
          domains: networkConfigToDomains(network),
          ca: { cert: ca.cert, key: ca.key },
        });
        await proxyHandle.start();
        session.proxyHandle = proxyHandle;

        // 7. Restore VM from snapshot
        const restoreOpts = {
          snapshotDir: config.snapshotDir,
          vmDir,
          ...(config.firecrackerBin ? { firecrackerBin: config.firecrackerBin } : {}),
        };
        const restoreResult = await restoreVm(restoreOpts);
        if (restoreResult.isErr()) {
          throw new WorkerError(
            WorkerErrorCode.EXECUTION_FAILED,
            `VM restore failed: ${restoreResult.error.message}`,
            restoreResult.error,
          );
        }
        vmHandle = restoreResult.value;
        session.vmHandle = vmHandle;

        // 8. Wait for SSH
        const sshOpts = {
          host: allocation.guestIp,
          keyPath: config.sshKeyPath,
        };

        const sshResult = await waitForSsh(sshOpts);
        if (sshResult.isErr()) throw sshResult.error;

        // 9. Inject CA cert into VM trust store
        const injectCaResult = await sshWriteFile(
          sshOpts,
          '/usr/local/share/ca-certificates/paws-session.crt',
          ca.cert,
        );
        if (injectCaResult.isErr()) throw injectCaResult.error;

        const updateCaResult = await sshExec(sshOpts, 'update-ca-certificates 2>/dev/null || true');
        if (updateCaResult.isErr()) throw updateCaResult.error;

        // 10. Write and execute workload script
        const envExports = Object.entries(request.workload.env)
          .map(([k, v]) => `export ${k}=${shellEscape(v)}`)
          .join('\n');

        const script = [
          '#!/bin/bash',
          'set -euo pipefail',
          envExports,
          request.workload.script,
        ].join('\n');

        const writeResult = await sshWriteFile(sshOpts, '/tmp/workload.sh', script);
        if (writeResult.isErr()) throw writeResult.error;

        await sshExec(sshOpts, 'chmod +x /tmp/workload.sh');

        // Execute with timeout
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

        // Read stderr
        const stderrResult = await sshReadFile(sshOpts, '/tmp/stderr.log');
        if (stderrResult.isOk()) {
          stderr = stderrResult.value;
        }

        // Check for non-zero exit code
        const exitCodeResult = await sshReadFile(sshOpts, '/tmp/exit_code');
        if (exitCodeResult.isOk()) {
          const match = exitCodeResult.value.match(/EXIT:(\d+)/);
          if (match?.[1]) {
            exitCode = parseInt(match[1], 10);
          }
        }

        // Try to read structured output
        const outputResult = await sshReadFile(sshOpts, '/output/result.json');
        if (outputResult.isOk()) {
          try {
            output = JSON.parse(outputResult.value);
          } catch {
            // Not valid JSON — ignore
          }
        }

        const durationMs = Date.now() - startedAt.getTime();

        return { exitCode, stdout, stderr, output, durationMs };
      } finally {
        // Cleanup — always runs
        session.status = 'stopping';

        if (vmHandle) {
          await stopVm(vmHandle);
        }

        if (proxyHandle) {
          await proxyHandle.stop();
        }

        if (allocation) {
          await teardownIptables(allocation);
          await deleteTap(allocation.tapDevice);
          ipPool.release(allocation.subnetIndex);
        }

        config.semaphore.release();
        sessions.delete(sessionId);
      }
    },

    /** Get all active sessions */
    get activeSessions(): ReadonlyMap<string, ActiveSession> {
      return sessions;
    },

    /** IP pool stats */
    get poolStats() {
      return {
        allocated: ipPool.size,
        available: ipPool.available,
      };
    },
  };
}

export type Executor = ReturnType<typeof createExecutor>;

/** Convert NetworkConfig (from @paws/types) to proxy-native domains map */
function networkConfigToDomains(
  network: NetworkConfig,
): Record<string, import('@paws/proxy').DomainEntry> {
  const domains: Record<string, import('@paws/proxy').DomainEntry> = {};

  // Add credential-bearing domains
  for (const [domain, cred] of Object.entries(network.credentials)) {
    domains[domain] = { headers: cred.headers };
  }

  // Add allowOut domains (no credentials) — skip if already in credentials
  for (const domain of network.allowOut) {
    if (!(domain in domains)) {
      domains[domain] = {};
    }
  }

  return domains;
}

/** Escape a value for safe shell interpolation */
function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
