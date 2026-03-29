import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPangolinResourceManager } from './pangolin-resources.js';

const BASE_CONFIG = {
  apiUrl: 'http://pangolin:3001/api/v1',
  apiKey: 'test-api-key',
  orgId: 'org-123',
  siteId: '456',
  domainId: 'dom-789',
  baseDomain: 'fleet.tpops.dev',
};

describe('createPangolinResourceManager', () => {
  const fetchSpy = vi.fn<typeof globalThis.fetch>();

  beforeEach(() => {
    fetchSpy.mockReset();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('expose', () => {
    it('creates Pangolin resources with two-step API (resource + target)', async () => {
      // Port 3000: create resource → create target
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { resourceId: 'res-1' } }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { targetId: 'tgt-1' } }), { status: 200 }),
      );
      // Port 5432: create resource → create target
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { resourceId: 'res-2' } }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { targetId: 'tgt-2' } }), { status: 200 }),
      );

      const manager = createPangolinResourceManager(BASE_CONFIG);
      const tunnels = await manager.expose(
        'abcdef12-3456-7890-abcd-ef1234567890',
        [
          { port: 3000, protocol: 'http', label: 'Web' },
          { port: 5432, protocol: 'http' },
        ],
        [10001, 10002],
      );

      expect(tunnels).toHaveLength(2);

      expect(tunnels[0]).toEqual({
        port: 3000,
        hostPort: 10001,
        resourceId: 'res-1',
        publicUrl: 'https://s-abcdef12-3000.fleet.tpops.dev',
        label: 'Web',
      });

      expect(tunnels[1]).toEqual({
        port: 5432,
        hostPort: 10002,
        resourceId: 'res-2',
        publicUrl: 'https://s-abcdef12-5432.fleet.tpops.dev',
        label: undefined,
      });

      // 4 API calls: 2 resources + 2 targets
      expect(fetchSpy).toHaveBeenCalledTimes(4);

      // Step 1: Create resource
      const [url1, opts1] = fetchSpy.mock.calls[0]!;
      expect(url1).toBe('http://pangolin:3001/api/v1/org/org-123/resource');
      const body1 = JSON.parse((opts1 as RequestInit).body as string);
      expect(body1.subdomain).toBe('s-abcdef12-3000');
      expect(body1.domainId).toBe('dom-789');
      expect(body1.http).toBe(true);

      // Step 2: Add target
      const [url2, opts2] = fetchSpy.mock.calls[1]!;
      expect(url2).toBe('http://pangolin:3001/api/v1/resource/res-1/target');
      const body2 = JSON.parse((opts2 as RequestInit).body as string);
      expect(body2.siteId).toBe(456);
      expect(body2.port).toBe(10001);
      expect(body2.method).toBe('http');
    });

    it('includes Authorization header with API key', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { resourceId: 'res-1' } }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { targetId: 'tgt-1' } }), { status: 200 }),
      );

      const manager = createPangolinResourceManager(BASE_CONFIG);
      await manager.expose(
        'abcdef12-0000-0000-0000-000000000000',
        [{ port: 80, protocol: 'http' }],
        [10001],
      );

      const [, opts] = fetchSpy.mock.calls[0]!;
      const headers = (opts as RequestInit).headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-api-key');
    });

    it('throws on resource creation error', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('server error', { status: 500 }));

      const manager = createPangolinResourceManager(BASE_CONFIG);
      await expect(
        manager.expose(
          'abcdef12-0000-0000-0000-000000000000',
          [{ port: 3000, protocol: 'http' }],
          [10001],
        ),
      ).rejects.toThrow('Pangolin resource creation failed for port 3000: 500');
    });

    it('cleans up resource on target creation error', async () => {
      // Resource created OK
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { resourceId: 'res-orphan' } }), { status: 200 }),
      );
      // Target creation fails
      fetchSpy.mockResolvedValueOnce(new Response('target error', { status: 500 }));
      // Cleanup delete of orphaned resource
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));

      const manager = createPangolinResourceManager(BASE_CONFIG);
      await expect(
        manager.expose(
          'abcdef12-0000-0000-0000-000000000000',
          [{ port: 3000, protocol: 'http' }],
          [10001],
        ),
      ).rejects.toThrow('Pangolin target creation failed for port 3000: 500');

      // 3 calls: create resource, fail target, cleanup resource
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      const [deleteUrl] = fetchSpy.mock.calls[2]!;
      expect(deleteUrl).toBe('http://pangolin:3001/api/v1/resource/res-orphan');
    });
  });

  describe('cleanup', () => {
    it('deletes each resource', async () => {
      fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));

      const manager = createPangolinResourceManager(BASE_CONFIG);
      await manager.cleanup([
        {
          port: 3000,
          hostPort: 10001,
          resourceId: 'res-1',
          publicUrl: 'https://s-abc-3000.fleet.tpops.dev',
        },
        {
          port: 5432,
          hostPort: 10002,
          resourceId: 'res-2',
          publicUrl: 'https://s-abc-5432.fleet.tpops.dev',
        },
      ]);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const [url1] = fetchSpy.mock.calls[0]!;
      expect(url1).toBe('http://pangolin:3001/api/v1/resource/res-1');
      const [, opts1] = fetchSpy.mock.calls[0]!;
      expect((opts1 as RequestInit).method).toBe('DELETE');
    });

    it('continues on 404 (resource already deleted)', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 404 }));
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));

      const manager = createPangolinResourceManager(BASE_CONFIG);
      await manager.cleanup([
        { port: 3000, hostPort: 10001, resourceId: 'gone', publicUrl: 'https://x.dev' },
        { port: 5432, hostPort: 10002, resourceId: 'exists', publicUrl: 'https://y.dev' },
      ]);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('continues on network error (best-effort)', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('network down'));
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));

      const manager = createPangolinResourceManager(BASE_CONFIG);
      await manager.cleanup([
        { port: 3000, hostPort: 10001, resourceId: 'res-1', publicUrl: 'https://x.dev' },
        { port: 5432, hostPort: 10002, resourceId: 'res-2', publicUrl: 'https://y.dev' },
      ]);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
