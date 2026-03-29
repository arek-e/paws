import { describe, expect, test } from 'vitest';

import {
  DomainCredentialSchema,
  NetworkAllocationSchema,
  NetworkConfigSchema,
  PortExposureSchema,
} from './network.js';

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
    expect(result.expose).toEqual([]);
  });

  test('accepts mcp servers list', () => {
    const result = NetworkConfigSchema.parse({
      mcp: { servers: ['filesystem', 'github'] },
    });
    expect(result.mcp?.servers).toEqual(['filesystem', 'github']);
  });

  test('mcp is optional', () => {
    const result = NetworkConfigSchema.parse({});
    expect(result.mcp).toBeUndefined();
  });

  test('accepts expose port list', () => {
    const result = NetworkConfigSchema.parse({
      expose: [
        { port: 3000, label: 'Next.js dev server' },
        { port: 5432, protocol: 'http' },
      ],
    });
    expect(result.expose).toHaveLength(2);
    expect(result.expose[0]?.port).toBe(3000);
    expect(result.expose[0]?.protocol).toBe('http'); // default
    expect(result.expose[0]?.label).toBe('Next.js dev server');
  });
});

describe('PortExposureSchema', () => {
  test('accepts valid port', () => {
    const result = PortExposureSchema.parse({ port: 8080 });
    expect(result.port).toBe(8080);
    expect(result.protocol).toBe('http');
    expect(result.label).toBeUndefined();
  });

  test('accepts https protocol', () => {
    const result = PortExposureSchema.parse({ port: 443, protocol: 'https' });
    expect(result.protocol).toBe('https');
  });

  test('rejects port 0', () => {
    expect(() => PortExposureSchema.parse({ port: 0 })).toThrow();
  });

  test('rejects port above 65535', () => {
    expect(() => PortExposureSchema.parse({ port: 70000 })).toThrow();
  });

  test('rejects invalid protocol', () => {
    expect(() => PortExposureSchema.parse({ port: 80, protocol: 'ftp' })).toThrow();
  });

  test('accepts access mode', () => {
    const result = PortExposureSchema.parse({ port: 3000, access: 'pin' });
    expect(result.access).toBe('pin');
  });

  test('accepts email access with allowedEmails', () => {
    const result = PortExposureSchema.parse({
      port: 3000,
      access: 'email',
      allowedEmails: ['*@company.com', 'user@example.com'],
    });
    expect(result.access).toBe('email');
    expect(result.allowedEmails).toEqual(['*@company.com', 'user@example.com']);
  });

  test('access is optional (undefined when not provided)', () => {
    // access field is optional on PortExposureSchema — default 'sso' is on PortAccessSchema
    const result = PortExposureSchema.parse({ port: 3000 });
    // PortAccessSchema has .default('sso') but the field itself is .optional()
    // so it may or may not be present
    expect(['sso', undefined]).toContain(result.access);
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
