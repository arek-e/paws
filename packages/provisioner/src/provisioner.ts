import type { Server, ServerStatus, ProvisionerDeps } from './types.js';

interface ProvisionConfig {
  /** Override timeouts for testing */
  timeouts?: Partial<Record<string, number>>;
}

interface StartOpts {
  server: Server;
  /** Root password for BYO servers */
  password?: string;
  /** Private key PEM for SSH auth */
  privateKey?: string;
  /** Passphrase for encrypted private key */
  passphrase?: string;
  /** URL the worker should call home to */
  gatewayUrl: string;
  /** API key for worker call-home auth */
  apiKey: string;
}

export interface Provisioner {
  start(opts: StartOpts): Promise<void>;
}

const DEFAULT_TIMEOUTS: Record<string, number> = {
  provisioning: 5 * 60_000,
  waiting_ssh: 2 * 60_000,
  bootstrapping: 15 * 60_000,
  registering: 2 * 60_000,
};

export function createProvisioner(deps: ProvisionerDeps, config?: ProvisionConfig): Provisioner {
  const { ssh, onEvent } = deps;
  const timeouts = { ...DEFAULT_TIMEOUTS, ...config?.timeouts };

  function emit(
    serverId: string,
    stage: ServerStatus,
    message: string,
    extra?: { progress?: number; error?: string },
  ) {
    onEvent({ serverId, stage, message, ...extra });
  }

  async function withTimeout<T>(stage: string, fn: () => Promise<T>): Promise<T> {
    const timeout = timeouts[stage] ?? 60_000;
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout: ${stage} exceeded ${timeout / 1000}s`)),
          timeout,
        ),
      ),
    ]);
  }

  async function waitForSsh(
    server: Server,
    password?: string,
    privateKey?: string,
    passphrase?: string,
  ): Promise<void> {
    const maxAttempts = 24; // 2 minutes at 5s intervals
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await ssh.connect({
          host: server.ip,
          username: 'root',
          ...(password ? { password } : {}),
          ...(privateKey ? { privateKey } : {}),
          ...(passphrase ? { passphrase } : {}),
        });
        return;
      } catch {
        if (i < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 5_000));
        }
      }
    }
    throw new Error('SSH connection failed after 2 minutes');
  }

  async function checkKvm(serverId: string): Promise<void> {
    const result = await ssh.exec('test -e /dev/kvm && echo "ok" || echo "missing"');
    if (!result.stdout.includes('ok')) {
      throw new Error(
        'This server does not support KVM (/dev/kvm not found). Firecracker requires bare metal or KVM-enabled instances.',
      );
    }
    emit(serverId, 'bootstrapping', '/dev/kvm verified');
  }

  async function runBootstrap(serverId: string, gatewayUrl: string, apiKey: string): Promise<void> {
    // Step 1: Run install-firecracker.sh
    emit(serverId, 'bootstrapping', 'Installing Firecracker...', {
      progress: 10,
    });

    const installResult = await ssh.execStream(
      'curl -fsSL https://raw.githubusercontent.com/arek-e/paws/main/scripts/install-firecracker.sh | bash',
      (line) => {
        // Parse PAWS_STAGE markers for progress
        if (line.startsWith('PAWS_STAGE:')) {
          const stage = line.slice('PAWS_STAGE:'.length);
          const progressMap: Record<string, number> = {
            checking_prerequisites: 15,
            downloading_firecracker: 25,
            creating_directories: 35,
            generating_ssh_keys: 40,
            downloading_kernel: 50,
            creating_rootfs: 60,
            complete: 80,
          };
          emit(serverId, 'bootstrapping', `Stage: ${stage}`, {
            progress: progressMap[stage] ?? 50,
          });
        }
      },
    );

    if (installResult.exitCode !== 0) {
      throw new Error(`install-firecracker.sh failed with exit code ${installResult.exitCode}`);
    }

    // Step 2: Install Bun
    emit(serverId, 'bootstrapping', 'Installing Bun runtime...', {
      progress: 82,
    });
    const bunResult = await ssh.exec(
      'command -v bun >/dev/null 2>&1 || curl -fsSL https://bun.sh/install | BUN_VERSION=1.3.10 bash',
    );
    if (bunResult.exitCode !== 0) {
      throw new Error(`Bun installation failed: ${bunResult.stderr}`);
    }

    // Step 3: Create worker systemd unit
    emit(serverId, 'bootstrapping', 'Configuring worker service...', {
      progress: 90,
    });
    const unitFile = `[Unit]
Description=paws worker
After=network.target

[Service]
Type=simple
ExecStart=/root/.bun/bin/bun run /opt/paws-worker/src/server.ts
WorkingDirectory=/opt/paws-worker
Environment=PORT=3000
Environment=GATEWAY_URL=${gatewayUrl}
Environment=API_KEY=${apiKey}
Environment=SNAPSHOT_DIR=/var/lib/paws/snapshots/agent-latest
Environment=VM_BASE_DIR=/var/lib/paws/vms
Environment=SSH_KEY_PATH=/var/lib/paws/ssh/id_ed25519
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target`;

    await ssh.exec(`cat > /etc/systemd/system/paws-worker.service << 'UNIT'\n${unitFile}\nUNIT`);
    await ssh.exec(
      'systemctl daemon-reload && systemctl enable paws-worker && systemctl start paws-worker',
    );

    emit(serverId, 'bootstrapping', 'Worker service started', { progress: 95 });
  }

  return {
    async start(opts) {
      const { server, password, privateKey, passphrase, gatewayUrl, apiKey } = opts;

      try {
        // Phase 1: Wait for SSH
        emit(server.id, 'waiting_ssh', 'Waiting for SSH access...');
        await withTimeout('waiting_ssh', () =>
          waitForSsh(server, password, privateKey, passphrase),
        );
        emit(server.id, 'waiting_ssh', 'SSH connected');

        // Phase 2: Bootstrap
        emit(server.id, 'bootstrapping', 'Starting bootstrap...');
        await checkKvm(server.id);
        await withTimeout('bootstrapping', () => runBootstrap(server.id, gatewayUrl, apiKey));
        emit(server.id, 'bootstrapping', 'Bootstrap complete');

        // Phase 3: Wait for registration
        emit(server.id, 'registering', 'Waiting for worker to call home...');
        // Note: The caller (setup routes) handles the registering -> ready transition
        // by watching the worker registry for a heartbeat from this server's IP.
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit(server.id, 'error', message, { error: message });
        throw err;
      } finally {
        ssh.disconnect();
      }
    },
  };
}
