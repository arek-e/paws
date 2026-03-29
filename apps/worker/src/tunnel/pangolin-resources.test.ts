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

/** Mock a successful share link response */
function mockShareLink(token = 'share-tok-1') {
  return new Response(JSON.stringify({ data: { token } }), { status: 200 });
}

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
    it('creates resources with resource + target + share link', async () => {
      // Port 3000: create resource → target → share link
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { resourceId: 'res-1' } }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { targetId: 'tgt-1' } }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(mockShareLink('tok-1'));
      // Port 5432: create resource → target → share link
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { resourceId: 'res-2' } }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { targetId: 'tgt-2' } }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(mockShareLink('tok-2'));

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
      expect(tunnels[0]?.port).toBe(3000);
      expect(tunnels[0]?.resourceId).toBe('res-1');
      expect(tunnels[0]?.publicUrl).toBe('https://s-abcdef12-web.fleet.tpops.dev');
      expect(tunnels[0]?.access).toBe('sso');
      expect(tunnels[0]?.shareLink).toContain('tok-1');

      expect(tunnels[1]?.port).toBe(5432);
      expect(tunnels[1]?.resourceId).toBe('res-2');

      // 6 API calls: (create + target + share) x 2 ports
      expect(fetchSpy).toHaveBeenCalledTimes(6);

      // Verify create resource call
      const [url1, opts1] = fetchSpy.mock.calls[0]!;
      expect(url1).toBe('http://pangolin:3001/api/v1/org/org-123/resource');
      const body1 = JSON.parse((opts1 as RequestInit).body as string);
      expect(body1.subdomain).toBe('s-abcdef12-web');
      expect(body1.domainId).toBe('dom-789');

      // Verify target call
      const [url2, opts2] = fetchSpy.mock.calls[1]!;
      expect(url2).toBe('http://pangolin:3001/api/v1/resource/res-1/target');
      const body2 = JSON.parse((opts2 as RequestInit).body as string);
      expect(body2.siteId).toBe(456);
      expect(body2.port).toBe(10001);
    });

    it('configures PIN auth when access is pin', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { resourceId: 'res-pin' } }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { targetId: 'tgt-1' } }), { status: 200 }),
      );
      // Auth config call (PIN)
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));
      // Share link
      fetchSpy.mockResolvedValueOnce(mockShareLink('tok-pin'));

      const manager = createPangolinResourceManager(BASE_CONFIG);
      const tunnels = await manager.expose(
        'abcdef12-0000-0000-0000-000000000000',
        [{ port: 3000, protocol: 'http', access: 'pin' }],
        [10001],
      );

      expect(tunnels[0]?.access).toBe('pin');
      expect(tunnels[0]?.pin).toMatch(/^\d{6}$/); // 6-digit PIN

      // Auth config call should set pincodeEnabled
      const [authUrl, authOpts] = fetchSpy.mock.calls[2]!;
      expect(authUrl).toBe('http://pangolin:3001/api/v1/resource/res-pin/auth');
      const authBody = JSON.parse((authOpts as RequestInit).body as string);
      expect(authBody.pincodeEnabled).toBe(true);
      expect(authBody.sso).toBe(false);
    });

    it('configures email whitelist when access is email', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { resourceId: 'res-email' } }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { targetId: 'tgt-1' } }), { status: 200 }),
      );
      // Auth config call (email)
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));
      // Share link
      fetchSpy.mockResolvedValueOnce(mockShareLink('tok-email'));

      const manager = createPangolinResourceManager(BASE_CONFIG);
      const tunnels = await manager.expose(
        'abcdef12-0000-0000-0000-000000000000',
        [{ port: 8080, protocol: 'http', access: 'email', allowedEmails: ['*@acme.com'] }],
        [10002],
      );

      expect(tunnels[0]?.access).toBe('email');

      const [authUrl, authOpts] = fetchSpy.mock.calls[2]!;
      expect(authUrl).toBe('http://pangolin:3001/api/v1/resource/res-email/auth');
      const authBody = JSON.parse((authOpts as RequestInit).body as string);
      expect(authBody.emailWhitelistEnabled).toBe(true);
      expect(authBody.emailWhitelist).toEqual(['*@acme.com']);
    });

    it('includes Authorization header with API key', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { resourceId: 'res-1' } }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { targetId: 'tgt-1' } }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(mockShareLink());

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
