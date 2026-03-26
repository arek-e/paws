import { describe, expect, test } from 'vitest';

import { DomainCredentialSchema, NetworkAllocationSchema, NetworkConfigSchema } from './network.js';

describe('DomainCredentialSchema', () => {
  test('accepts headers map', () => {
    const result = DomainCredentialSchema.parse({
      headers: { 'x-api-key': 'sk-ant-123' },
    });
    expect(result.headers['x-api-key']).toBe('sk-ant-123');
  });

  test('rejects missing headers', () => {
    expect(() => DomainCredentialSchema.parse({})).toThrow();
  });
});

describe('NetworkConfigSchema', () => {
  test('accepts full config', () => {
    const result = NetworkConfigSchema.parse({
      allowOut: ['api.anthropic.com', '*.github.com'],
      credentials: {
        'api.anthropic.com': {
          headers: { 'x-api-key': 'sk-ant-123' },
        },
      },
    });
    expect(result.allowOut).toEqual(['api.anthropic.com', '*.github.com']);
    expect(result.credentials['api.anthropic.com']?.headers['x-api-key']).toBe('sk-ant-123');
  });

  test('defaults allowOut to empty array', () => {
    const result = NetworkConfigSchema.parse({});
    expect(result.allowOut).toEqual([]);
    expect(result.credentials).toEqual({});
  });
});

describe('NetworkAllocationSchema', () => {
  test('accepts valid allocation', () => {
    const result = NetworkAllocationSchema.parse({
      tapDevice: 'tap0',
      subnetIndex: 0,
      hostIp: '172.16.0.1',
      guestIp: '172.16.0.2',
      subnet: '172.16.0.0/30',
    });
    expect(result.hostIp).toBe('172.16.0.1');
    expect(result.guestIp).toBe('172.16.0.2');
  });

  test('rejects invalid IP', () => {
    expect(() =>
      NetworkAllocationSchema.parse({
        tapDevice: 'tap0',
        subnetIndex: 0,
        hostIp: 'not-an-ip',
        guestIp: '172.16.0.2',
        subnet: '172.16.0.0/30',
      }),
    ).toThrow();
  });

  test('rejects negative subnet index', () => {
    expect(() =>
      NetworkAllocationSchema.parse({
        tapDevice: 'tap0',
        subnetIndex: -1,
        hostIp: '172.16.0.1',
        guestIp: '172.16.0.2',
        subnet: '172.16.0.0/30',
      }),
    ).toThrow();
  });
});
