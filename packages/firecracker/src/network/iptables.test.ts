import type { NetworkAllocation } from '@paws/types';

import { describe, expect, it } from 'vitest';

import type { ExecFn } from '../types.js';

import {
  setupInboundPort,
  setupIptables,
  teardownInboundPort,
  teardownIptables,
} from './iptables.js';

function createMockExec(): {
  exec: ExecFn;
  calls: Array<{ cmd: string; args: readonly string[] }>;
} {
  const calls: Array<{ cmd: string; args: readonly string[] }> = [];
  return {
    exec: async (cmd, args) => {
      calls.push({ cmd, args });
      return { stdout: '', stderr: '' };
    },
    calls,
  };
}

const testAlloc: NetworkAllocation = {
  tapDevice: 'tap0',
  subnetIndex: 0,
  hostIp: '172.16.0.1',
  guestIp: '172.16.0.2',
  subnet: '172.16.0.0/30',
};

describe('setupIptables', () => {
  it('creates 5 iptables rules with default ports', async () => {
    const { exec, calls } = createMockExec();

    const result = await setupIptables(testAlloc, {}, { exec });
    expect(result.isOk()).toBe(true);
    expect(calls).toHaveLength(5);

    // DNAT HTTP
    expect(calls[0]).toEqual({
      cmd: 'iptables',
      args: [
        '-t',
        'nat',
        '-A',
        'PREROUTING',
        '-i',
        'tap0',
        '-p',
        'tcp',
        '--dport',
        '80',
        '-j',
        'DNAT',
        '--to',
        '172.16.0.1:8080',
      ],
    });

    // DNAT HTTPS
    expect(calls[1]).toEqual({
      cmd: 'iptables',
      args: [
        '-t',
        'nat',
        '-A',
        'PREROUTING',
        '-i',
        'tap0',
        '-p',
        'tcp',
        '--dport',
        '443',
        '-j',
        'DNAT',
        '--to',
        '172.16.0.1:8443',
      ],
    });

    // Forward allow to proxy
    expect(calls[2]).toEqual({
      cmd: 'iptables',
      args: ['-A', 'FORWARD', '-i', 'tap0', '-d', '172.16.0.1', '-j', 'ACCEPT'],
    });

    // Established connections back
    expect(calls[3]).toEqual({
      cmd: 'iptables',
      args: [
        '-A',
        'FORWARD',
        '-o',
        'tap0',
        '-m',
        'conntrack',
        '--ctstate',
        'RELATED,ESTABLISHED',
        '-j',
        'ACCEPT',
      ],
    });

    // Drop everything else
    expect(calls[4]).toEqual({
      cmd: 'iptables',
      args: ['-A', 'FORWARD', '-i', 'tap0', '-j', 'DROP'],
    });
  });

  it('uses custom ports', async () => {
    const { exec, calls } = createMockExec();

    await setupIptables(testAlloc, { httpPort: 9080, httpsPort: 9443 }, { exec });

    expect(calls[0]!.args).toContain('172.16.0.1:9080');
    expect(calls[1]!.args).toContain('172.16.0.1:9443');
  });

  it('returns error when exec fails', async () => {
    const exec: ExecFn = async () => {
      throw new Error('iptables not found');
    };

    const result = await setupIptables(testAlloc, {}, { exec });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('IPTABLES_FAILED');
  });
});

describe('teardownIptables', () => {
  it('removes rules in reverse order with -D', async () => {
    const { exec, calls } = createMockExec();

    const result = await teardownIptables(testAlloc, {}, { exec });
    expect(result.isOk()).toBe(true);
    expect(calls).toHaveLength(5);

    // All should use -D instead of -A
    for (const call of calls) {
      expect(call.cmd).toBe('iptables');
      expect(call.args).toContain('-D');
      expect(call.args).not.toContain('-A');
    }
  });

  it('returns error when exec fails', async () => {
    const exec: ExecFn = async () => {
      throw new Error('iptables error');
    };

    const result = await teardownIptables(testAlloc, {}, { exec });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('IPTABLES_FAILED');
  });
});

describe('setupInboundPort', () => {
  it('creates DNAT + FORWARD rules for inbound port', async () => {
    const { exec, calls } = createMockExec();

    const result = await setupInboundPort(testAlloc, 10001, 3000, { exec });
    expect(result.isOk()).toBe(true);
    expect(calls).toHaveLength(2);

    // DNAT: hostPort → guestIp:guestPort
    expect(calls[0]).toEqual({
      cmd: 'iptables',
      args: [
        '-t',
        'nat',
        '-A',
        'PREROUTING',
        '-p',
        'tcp',
        '--dport',
        '10001',
        '-j',
        'DNAT',
        '--to',
        '172.16.0.2:3000',
      ],
    });

    // FORWARD allow to guest
    expect(calls[1]).toEqual({
      cmd: 'iptables',
      args: ['-A', 'FORWARD', '-d', '172.16.0.2', '-p', 'tcp', '--dport', '3000', '-j', 'ACCEPT'],
    });
  });

  it('returns error when exec fails', async () => {
    const exec: ExecFn = async () => {
      throw new Error('iptables failed');
    };

    const result = await setupInboundPort(testAlloc, 10001, 3000, { exec });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('IPTABLES_FAILED');
  });
});

describe('teardownInboundPort', () => {
  it('removes inbound rules with -D in reverse order', async () => {
    const { exec, calls } = createMockExec();

    const result = await teardownInboundPort(testAlloc, 10001, 3000, { exec });
    expect(result.isOk()).toBe(true);
    expect(calls).toHaveLength(2);

    // FORWARD delete first
    expect(calls[0]!.args).toContain('-D');
    expect(calls[0]!.args).toContain('172.16.0.2');
    expect(calls[0]!.args).toContain('3000');

    // NAT delete second
    expect(calls[1]!.args).toContain('-D');
    expect(calls[1]!.args).toContain('10001');
    expect(calls[1]!.args).toContain('172.16.0.2:3000');
  });

  it('returns error when exec fails', async () => {
    const exec: ExecFn = async () => {
      throw new Error('iptables failed');
    };

    const result = await teardownInboundPort(testAlloc, 10001, 3000, { exec });
    expect(result.isErr()).toBe(true);
  });
});
