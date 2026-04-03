import { describe, expect, it } from 'vitest';

import { generateExposedUrls, extractSessionFromHost } from './expose.js';

describe('generateExposedUrls', () => {
  it('generates subdomain URLs with fleet domain', () => {
    const urls = generateExposedUrls(
      'abc123',
      [
        { port: 3000, label: 'Dev Server' },
        { port: 8080, label: 'Agent UI', access: 'sso' },
      ],
      'fleet.tpops.dev',
    );

    expect(urls).toHaveLength(2);
    expect(urls[0]!.url).toBe('https://s-abc123.fleet.tpops.dev/');
    expect(urls[0]!.port).toBe(3000);
    expect(urls[0]!.label).toBe('Dev Server');
    expect(urls[1]!.url).toBe('https://s-abc123.fleet.tpops.dev/');
    expect(urls[1]!.access).toBe('sso');
  });

  it('generates localhost URLs without fleet domain', () => {
    const urls = generateExposedUrls('xyz789', [{ port: 3000 }]);

    expect(urls[0]!.url).toBe('http://s-xyz789.localhost:3000/');
  });

  it('generates PIN for pin access mode', () => {
    const urls = generateExposedUrls('sess1', [{ port: 3000, access: 'pin' }]);

    expect(urls[0]!.pin).toBeDefined();
    expect(urls[0]!.pin).toHaveLength(6);
    expect(urls[0]!.pin).toMatch(/^\d{6}$/);
  });

  it('uses pathPrefix when specified', () => {
    const urls = generateExposedUrls(
      'abc',
      [{ port: 3000, pathPrefix: '/app' }],
      'fleet.tpops.dev',
    );

    expect(urls[0]!.url).toBe('https://s-abc.fleet.tpops.dev/app');
  });
});

describe('extractSessionFromHost', () => {
  it('extracts session ID from subdomain', () => {
    expect(extractSessionFromHost('s-abc123.fleet.tpops.dev', 'fleet.tpops.dev')).toBe('abc123');
  });

  it('returns undefined for non-session subdomains', () => {
    expect(extractSessionFromHost('fleet.tpops.dev', 'fleet.tpops.dev')).toBeUndefined();
    expect(extractSessionFromHost('grafana.tpops.dev', 'fleet.tpops.dev')).toBeUndefined();
  });

  it('returns undefined for wrong domain', () => {
    expect(extractSessionFromHost('s-abc.other.com', 'fleet.tpops.dev')).toBeUndefined();
  });

  it('handles session IDs with hyphens', () => {
    expect(extractSessionFromHost('s-abc-def-123.fleet.tpops.dev', 'fleet.tpops.dev')).toBe(
      'abc-def-123',
    );
  });
});
