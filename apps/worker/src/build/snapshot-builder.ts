import {
  allocateSubnet,
  createFirecrackerClient,
  createTap,
  deleteTap,
  setupIptables,
  stopVm,
  teardownIptables,
} from '@paws/firecracker';
import type { VmHandle } from '@paws/firecracker';

import { sshExec, sshWriteFile, waitForSsh } from '../ssh/client.js';

/**
 * High subnet index for snapshot builds to avoid collisions with running VMs.
 * Matches the bash script's BUILD_SUBNET_INDEX.
 */
const BUILD_SUBNET_INDEX = 16383;

export interface SnapshotBuildConfig {
  /** Base snapshot/rootfs to start from */
  base: string;
  /** Setup script to run inside the VM */
  setup: string;
  /** VM resources */
  resources?: { vcpus?: number; memoryMB?: number } | undefined;
}

export interface SnapshotBuildResult {
  snapshotId: string;
  status: 'ready' | 'failed';
  error?: string | undefined;
}

export interface SnapshotBuilderConfig {
  /** Path to base snapshot directory (contains vmstate.snap, memory.snap, disk.ext4) */
  snapshotBaseDir: string;
  /** Where to write the new snapshot */
  outputDir: string;
  /** SSH key path */
  sshKeyPath: string;
  /** Path to firecracker binary */
  firecrackerBin?: string | undefined;
}

/**
 * Build a snapshot by booting a VM from a base snapshot, running a setup script,
 * then pausing and saving the snapshot files.
 *
 * This is the TypeScript equivalent of scripts/build-snapshot.sh, using the
 * existing @paws/firecracker and SSH client packages.
 */
export async function buildSnapshot(
  snapshotId: string,
  buildConfig: SnapshotBuildConfig,
  config: SnapshotBuilderConfig,
): Promise<SnapshotBuildResult> {
  const allocResult = allocateSubnet(BUILD_SUBNET_INDEX);
  if (allocResult.isErr()) {
    return { snapshotId, status: 'failed', error: allocResult.error.message };
  }
  const alloc = allocResult.value;

  let vmHandle: VmHandle | undefined;

  try {
    // 1. Create TAP device for the build VM
    const tapResult = await createTap(alloc);
    if (tapResult.isErr()) {
      return {
        snapshotId,
        status: 'failed',
        error: `TAP creation failed: ${tapResult.error.message}`,
      };
    }

    // 2. Setup iptables (needed for outbound internet during setup)
    const iptResult = await setupIptables(alloc);
    if (iptResult.isErr()) {
      return { snapshotId, status: 'failed', error: `iptables failed: ${iptResult.error.message}` };
    }

    // 3. Copy disk and restore VM from base snapshot
    const snapshotDir = `${config.snapshotBaseDir}/${buildConfig.base}`;
    const vmDir = `${config.outputDir}/${snapshotId}-build`;

    // Create build working directory
    const { execSync } = await import('node:child_process');
    execSync(`mkdir -p ${vmDir}`);
    execSync(`cp --reflink=auto ${snapshotDir}/disk.ext4 ${vmDir}/disk.ext4`);

    const { restoreVm } = await import('@paws/firecracker');
    const restoreResult = await restoreVm({
      snapshotDir,
      vmDir,
      ...(config.firecrackerBin ? { firecrackerBin: config.firecrackerBin } : {}),
    });
    if (restoreResult.isErr()) {
      return {
        snapshotId,
        status: 'failed',
        error: `VM restore failed: ${restoreResult.error.message}`,
      };
    }
    vmHandle = restoreResult.value;

    // 4. Wait for SSH
    const sshOpts = { host: alloc.guestIp, keyPath: config.sshKeyPath };
    const sshResult = await waitForSsh(sshOpts);
    if (sshResult.isErr()) {
      return { snapshotId, status: 'failed', error: `SSH wait failed: ${sshResult.error.message}` };
    }

    // 5. Run setup script
    if (buildConfig.setup.trim()) {
      const writeResult = await sshWriteFile(
        sshOpts,
        '/tmp/setup.sh',
        `#!/bin/bash\nset -euo pipefail\n${buildConfig.setup}`,
      );
      if (writeResult.isErr()) {
        return {
          snapshotId,
          status: 'failed',
          error: `Write setup script failed: ${writeResult.error.message}`,
        };
      }

      await sshExec(sshOpts, 'chmod +x /tmp/setup.sh');
      const setupResult = await sshExec(sshOpts, 'timeout 600 /tmp/setup.sh');
      if (setupResult.isErr()) {
        return {
          snapshotId,
          status: 'failed',
          error: `Setup script failed: ${setupResult.error.message}`,
        };
      }
    }

    // 6. Pause VM and create snapshot
    if (vmHandle.socketPath) {
      const fc = createFirecrackerClient(vmHandle.socketPath);
      const pauseResult = await fc.pauseVm();
      if (pauseResult.isErr()) {
        return {
          snapshotId,
          status: 'failed',
          error: `Pause failed: ${pauseResult.error.message}`,
        };
      }

      const snapResult = await fc.createSnapshot({
        snapshotType: 'Full',
        snapshotPath: `${vmDir}/vmstate.snap`,
        memFilePath: `${vmDir}/memory.snap`,
      });
      if (snapResult.isErr()) {
        return {
          snapshotId,
          status: 'failed',
          error: `Snapshot failed: ${snapResult.error.message}`,
        };
      }
    }

    // 7. Install snapshot to output directory
    const outputPath = `${config.outputDir}/${snapshotId}`;
    execSync(`mkdir -p ${outputPath}`);
    execSync(`cp ${vmDir}/disk.ext4 ${outputPath}/disk.ext4`);
    execSync(`cp ${vmDir}/vmstate.snap ${outputPath}/vmstate.snap`);
    execSync(`cp ${vmDir}/memory.snap ${outputPath}/memory.snap`);

    // Write manifest
    const manifest = {
      id: snapshotId,
      version: 1,
      createdAt: new Date().toISOString(),
      files: ['disk.ext4', 'memory.snap', 'vmstate.snap'],
    };
    await Bun.write(`${outputPath}/manifest.json`, JSON.stringify(manifest, null, 2));

    return { snapshotId, status: 'ready' };
  } catch (err) {
    return {
      snapshotId,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    // Cleanup
    if (vmHandle) {
      await stopVm(vmHandle);
    }
    await teardownIptables(alloc);
    await deleteTap(alloc.tapDevice);
  }
}
