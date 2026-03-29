import { describe, expect, test } from 'vitest';

import {
  SnapshotConfigListResponseSchema,
  SnapshotConfigSchema,
  SnapshotTemplateId,
} from './snapshot-config.js';

describe('SnapshotTemplateId', () => {
  test('accepts valid template IDs', () => {
    for (const id of ['minimal', 'node', 'python', 'docker', 'fullstack']) {
      expect(SnapshotTemplateId.parse(id)).toBe(id);
    }
  });

  test('rejects unknown template', () => {
    expect(() => SnapshotTemplateId.parse('ruby')).toThrow();
  });
});

describe('SnapshotConfigSchema', () => {
  test('accepts full config', () => {
    const result = SnapshotConfigSchema.parse({
      id: 'docker-ready',
      template: 'docker',
      resources: { vcpus: 4, memoryMB: 8192 },
      setup: 'apt-get update && apt-get install -y docker.io',
      requiredDomains: ['registry-1.docker.io', 'auth.docker.io'],
    });
    expect(result.id).toBe('docker-ready');
    expect(result.template).toBe('docker');
    expect(result.resources?.vcpus).toBe(4);
    expect(result.requiredDomains).toHaveLength(2);
  });

  test('accepts minimal config (no template, no resources)', () => {
    const result = SnapshotConfigSchema.parse({
      id: 'custom',
      setup: 'echo hello',
    });
    expect(result.id).toBe('custom');
    expect(result.template).toBeUndefined();
    expect(result.resources).toBeUndefined();
    expect(result.requiredDomains).toEqual([]);
  });

  test('rejects empty id', () => {
    expect(() => SnapshotConfigSchema.parse({ id: '', setup: 'echo hi' })).toThrow();
  });

  test('rejects whitespace-only id', () => {
    expect(() => SnapshotConfigSchema.parse({ id: '   ', setup: 'echo hi' })).toThrow();
  });

  test('defaults requiredDomains to empty array', () => {
    const result = SnapshotConfigSchema.parse({
      id: 'test',
      setup: 'true',
    });
    expect(result.requiredDomains).toEqual([]);
  });
});

describe('SnapshotConfigListResponseSchema', () => {
  test('accepts list of configs', () => {
    const result = SnapshotConfigListResponseSchema.parse({
      configs: [
        { id: 'minimal', setup: 'apt-get install openssh-server' },
        { id: 'docker', template: 'docker', setup: 'curl -fsSL https://get.docker.com | sh' },
      ],
    });
    expect(result.configs).toHaveLength(2);
  });

  test('accepts empty list', () => {
    const result = SnapshotConfigListResponseSchema.parse({ configs: [] });
    expect(result.configs).toEqual([]);
  });
});
