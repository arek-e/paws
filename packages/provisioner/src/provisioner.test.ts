import { describe, test, expect, vi } from 'vitest';
import { createProvisioner } from './provisioner.js';
import type { SshClient, Server, ProvisionerEvent } from './types.js';

function createMockSsh(overrides?: Partial<SshClient>): SshClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    exec: vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 }),
    execStream: vi
      .fn()
      .mockImplementation((_cmd: string, _onLine: (line: string) => void) =>
        Promise.resolve({ exitCode: 0 }),
      ),
    scp: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    ...overrides,
  };
}

function createTestServer(overrides?: Partial<Server>): Server {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'test-server',
    ip: '10.0.0.1',
    status: 'provisioning',
    provider: 'manual',
    sshPublicKey: 'ssh-ed25519 AAAA...',
    sshPrivateKeyEncrypted: 'encrypted-key',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const defaultStartOpts = {
  server: createTestServer(),
  password: 'test-password',
  gatewayUrl: 'https://gateway.example.com',
  apiKey: 'test-api-key',
};

describe('createProvisioner', () => {
  test('BYO path: connects via SSH with password, runs bootstrap, emits events', async () => {
    const ssh = createMockSsh();
    const events: ProvisionerEvent[] = [];
    const provisioner = createProvisioner(
      { ssh, onEvent: (e) => events.push(e) },
      { timeouts: { waiting_ssh: 5_000, bootstrapping: 5_000 } },
    );

    await provisioner.start(defaultStartOpts);

    expect(ssh.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '10.0.0.1',
        username: 'root',
        password: 'test-password',
      }),
    );
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.stage === 'waiting_ssh')).toBe(true);
    expect(events.some((e) => e.stage === 'bootstrapping')).toBe(true);
  });

  test('BYO path: connects via SSH with private key', async () => {
    const ssh = createMockSsh();
    const events: ProvisionerEvent[] = [];
    const provisioner = createProvisioner(
      { ssh, onEvent: (e) => events.push(e) },
      { timeouts: { waiting_ssh: 5_000, bootstrapping: 5_000 } },
    );

    await provisioner.start({
      ...defaultStartOpts,
      privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----',
    });

    expect(ssh.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '10.0.0.1',
        username: 'root',
        privateKey: expect.stringContaining('BEGIN OPENSSH PRIVATE KEY'),
      }),
    );
  });

  test('SSH connect fails: transitions to error', async () => {
    const ssh = createMockSsh({
      connect: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });
    const events: ProvisionerEvent[] = [];
    const provisioner = createProvisioner(
      { ssh, onEvent: (e) => events.push(e) },
      { timeouts: { waiting_ssh: 100 } },
    );

    await expect(provisioner.start(defaultStartOpts)).rejects.toThrow();

    const errorEvent = events.find((e) => e.stage === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.error).toBeDefined();
  });

  test('SSH connect timeout: times out with short timeout override', async () => {
    const ssh = createMockSsh({
      connect: vi.fn().mockImplementation(() => new Promise(() => {})), // never resolves
    });
    const events: ProvisionerEvent[] = [];
    const provisioner = createProvisioner(
      { ssh, onEvent: (e) => events.push(e) },
      { timeouts: { waiting_ssh: 100 } },
    );

    await expect(provisioner.start(defaultStartOpts)).rejects.toThrow('Timeout');

    const errorEvent = events.find((e) => e.stage === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.error).toContain('Timeout');
  });

  test('/dev/kvm check passes: continues to bootstrap', async () => {
    const ssh = createMockSsh({
      exec: vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 }),
    });
    const events: ProvisionerEvent[] = [];
    const provisioner = createProvisioner(
      { ssh, onEvent: (e) => events.push(e) },
      { timeouts: { waiting_ssh: 5_000, bootstrapping: 5_000 } },
    );

    await provisioner.start(defaultStartOpts);

    expect(events.some((e) => e.message === '/dev/kvm verified')).toBe(true);
    expect(events.some((e) => e.message.includes('Installing Firecracker'))).toBe(true);
  });

  test('/dev/kvm check fails: emits error with KVM not found message', async () => {
    const ssh = createMockSsh({
      exec: vi.fn().mockResolvedValue({ stdout: 'missing', stderr: '', exitCode: 0 }),
    });
    const events: ProvisionerEvent[] = [];
    const provisioner = createProvisioner(
      { ssh, onEvent: (e) => events.push(e) },
      { timeouts: { waiting_ssh: 5_000, bootstrapping: 5_000 } },
    );

    await expect(provisioner.start(defaultStartOpts)).rejects.toThrow('KVM');

    const errorEvent = events.find((e) => e.stage === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.error).toContain('KVM');
  });

  test('Bootstrap script fails: emits error with exit code', async () => {
    const ssh = createMockSsh({
      execStream: vi.fn().mockResolvedValue({ exitCode: 1 }),
    });
    const events: ProvisionerEvent[] = [];
    const provisioner = createProvisioner(
      { ssh, onEvent: (e) => events.push(e) },
      { timeouts: { waiting_ssh: 5_000, bootstrapping: 5_000 } },
    );

    await expect(provisioner.start(defaultStartOpts)).rejects.toThrow(
      'install-firecracker.sh failed with exit code 1',
    );

    const errorEvent = events.find((e) => e.stage === 'error');
    expect(errorEvent?.error).toContain('exit code 1');
  });

  test('Bun install fails: emits error', async () => {
    let execCallCount = 0;
    const ssh = createMockSsh({
      exec: vi.fn().mockImplementation(() => {
        execCallCount++;
        // First call is KVM check (ok), second is bun install (fail)
        if (execCallCount === 1) {
          return Promise.resolve({ stdout: 'ok', stderr: '', exitCode: 0 });
        }
        return Promise.resolve({ stdout: '', stderr: 'curl failed', exitCode: 1 });
      }),
    });
    const events: ProvisionerEvent[] = [];
    const provisioner = createProvisioner(
      { ssh, onEvent: (e) => events.push(e) },
      { timeouts: { waiting_ssh: 5_000, bootstrapping: 5_000 } },
    );

    await expect(provisioner.start(defaultStartOpts)).rejects.toThrow('Bun installation failed');

    const errorEvent = events.find((e) => e.stage === 'error');
    expect(errorEvent?.error).toContain('Bun installation failed');
  });

  test('Systemd unit created: verifies exec was called with systemd commands', async () => {
    const ssh = createMockSsh();
    const events: ProvisionerEvent[] = [];
    const provisioner = createProvisioner(
      { ssh, onEvent: (e) => events.push(e) },
      { timeouts: { waiting_ssh: 5_000, bootstrapping: 5_000 } },
    );

    await provisioner.start(defaultStartOpts);

    const execCalls = (ssh.exec as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    expect(execCalls.some((cmd: string) => cmd.includes('paws-worker.service'))).toBe(true);
    expect(execCalls.some((cmd: string) => cmd.includes('systemctl daemon-reload'))).toBe(true);
  });

  test('Events emitted in order: waiting_ssh -> bootstrapping -> registering', async () => {
    const ssh = createMockSsh();
    const events: ProvisionerEvent[] = [];
    const provisioner = createProvisioner(
      { ssh, onEvent: (e) => events.push(e) },
      { timeouts: { waiting_ssh: 5_000, bootstrapping: 5_000 } },
    );

    await provisioner.start(defaultStartOpts);

    const stages = events.map((e) => e.stage);
    const waitingSshIdx = stages.indexOf('waiting_ssh');
    const bootstrappingIdx = stages.indexOf('bootstrapping');
    const registeringIdx = stages.indexOf('registering');

    expect(waitingSshIdx).toBeLessThan(bootstrappingIdx);
    expect(bootstrappingIdx).toBeLessThan(registeringIdx);
  });

  test('PAWS_STAGE markers parsed: execStream callback receives stage lines', async () => {
    const ssh = createMockSsh({
      execStream: vi.fn().mockImplementation((_cmd: string, onLine: (line: string) => void) => {
        onLine('PAWS_STAGE:checking_prerequisites');
        onLine('PAWS_STAGE:downloading_firecracker');
        onLine('PAWS_STAGE:complete');
        return Promise.resolve({ exitCode: 0 });
      }),
    });
    const events: ProvisionerEvent[] = [];
    const provisioner = createProvisioner(
      { ssh, onEvent: (e) => events.push(e) },
      { timeouts: { waiting_ssh: 5_000, bootstrapping: 5_000 } },
    );

    await provisioner.start(defaultStartOpts);

    const stageEvents = events.filter((e) => e.message.startsWith('Stage:'));
    expect(stageEvents.length).toBe(3);
    expect(stageEvents[0]!.message).toBe('Stage: checking_prerequisites');
    expect(stageEvents[1]!.message).toBe('Stage: downloading_firecracker');
    expect(stageEvents[2]!.message).toBe('Stage: complete');
  });

  test('Disconnect called on success', async () => {
    const ssh = createMockSsh();
    const provisioner = createProvisioner(
      { ssh, onEvent: () => {} },
      { timeouts: { waiting_ssh: 5_000, bootstrapping: 5_000 } },
    );

    await provisioner.start(defaultStartOpts);

    expect(ssh.disconnect).toHaveBeenCalled();
  });

  test('Disconnect called on failure', async () => {
    const ssh = createMockSsh({
      exec: vi.fn().mockResolvedValue({ stdout: 'missing', stderr: '', exitCode: 0 }),
    });
    const provisioner = createProvisioner(
      { ssh, onEvent: () => {} },
      { timeouts: { waiting_ssh: 5_000, bootstrapping: 5_000 } },
    );

    await expect(provisioner.start(defaultStartOpts)).rejects.toThrow();

    expect(ssh.disconnect).toHaveBeenCalled();
  });

  test('Worker service env vars include GATEWAY_URL and API_KEY', async () => {
    const ssh = createMockSsh();
    const provisioner = createProvisioner(
      { ssh, onEvent: () => {} },
      { timeouts: { waiting_ssh: 5_000, bootstrapping: 5_000 } },
    );

    await provisioner.start(defaultStartOpts);

    const execCalls = (ssh.exec as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    const unitCmd = execCalls.find((cmd: string) => cmd.includes('paws-worker.service'));
    expect(unitCmd).toBeDefined();
    expect(unitCmd).toContain('GATEWAY_URL=https://gateway.example.com');
    expect(unitCmd).toContain('API_KEY=test-api-key');
  });

  test('Progress percentages increase monotonically', async () => {
    const ssh = createMockSsh({
      execStream: vi.fn().mockImplementation((_cmd: string, onLine: (line: string) => void) => {
        onLine('PAWS_STAGE:checking_prerequisites');
        onLine('PAWS_STAGE:downloading_firecracker');
        onLine('PAWS_STAGE:creating_directories');
        onLine('PAWS_STAGE:complete');
        return Promise.resolve({ exitCode: 0 });
      }),
    });
    const events: ProvisionerEvent[] = [];
    const provisioner = createProvisioner(
      { ssh, onEvent: (e) => events.push(e) },
      { timeouts: { waiting_ssh: 5_000, bootstrapping: 5_000 } },
    );

    await provisioner.start(defaultStartOpts);

    const progressValues = events.filter((e) => e.progress !== undefined).map((e) => e.progress!);
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]!).toBeGreaterThanOrEqual(progressValues[i - 1]!);
    }
  });

  test('Error event includes error message', async () => {
    const ssh = createMockSsh({
      connect: vi.fn().mockRejectedValue(new Error('Host unreachable')),
    });
    const events: ProvisionerEvent[] = [];
    const provisioner = createProvisioner(
      { ssh, onEvent: (e) => events.push(e) },
      { timeouts: { waiting_ssh: 100 } },
    );

    await expect(provisioner.start(defaultStartOpts)).rejects.toThrow();

    const errorEvent = events.find((e) => e.stage === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.error).toBeTruthy();
    expect(errorEvent?.message).toBeTruthy();
    expect(errorEvent?.error).toBe(errorEvent?.message);
  });
});
