/**
 * Pangolin admin client — proxies dashboard operations through the paws control plane.
 *
 * Wraps the Pangolin REST API so the paws dashboard never talks to Pangolin directly.
 * Covers: resources (tunnels), sites, domains, users, identity providers.
 */

import { createLogger } from '@paws/logger';

const log = createLogger('pangolin-admin');

export interface PangolinAdminConfig {
  apiUrl: string;
  apiKey?: string | undefined;
  email?: string | undefined;
  password?: string | undefined;
  orgId: string;
}

export interface PangolinResource {
  resourceId: string | number;
  name: string;
  subdomain?: string;
  fullDomain?: string;
  http: boolean;
  protocol: string;
}

export interface PangolinSite {
  siteId: string | number;
  name: string;
  online: boolean;
  subnet?: string;
  type: string;
}

export interface PangolinDomain {
  domainId: string;
  baseDomain: string;
}

export interface PangolinUser {
  userId: string;
  email: string;
  name?: string;
  role?: string;
}

export interface PangolinIdp {
  idpId: number;
  name: string;
  type: string;
}

export function createPangolinAdmin(config: PangolinAdminConfig) {
  const { apiUrl, apiKey, email, password, orgId } = config;
  let sessionCookie = '';

  async function login(): Promise<void> {
    if (!email || !password) return;
    const res = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'x-csrf-protection' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Pangolin login failed: ${res.status}`);
    const cookies = res.headers.getSetCookie?.() ?? [];
    sessionCookie = cookies.map((c: string) => c.split(';')[0]).join('; ');
  }

  function headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-csrf-token': 'x-csrf-protection',
    };
    if (apiKey) h['Authorization'] = `Bearer ${apiKey}`;
    else if (sessionCookie) h['Cookie'] = sessionCookie;
    return h;
  }

  async function request(method: string, path: string, body?: unknown): Promise<unknown> {
    let res = await fetch(`${apiUrl}${path}`, {
      method,
      headers: headers(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 401 && email && password) {
      await login();
      res = await fetch(`${apiUrl}${path}`, {
        method,
        headers: headers(),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10_000),
      });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Pangolin API ${method} ${path}: ${res.status} ${text}`);
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return res.json();
    }
    return null;
  }

  // Initialize session if using email/password auth
  if (email && password) {
    login().catch((err) => log.error('Initial login failed', { error: String(err) }));
  }

  return {
    // --- Resources (tunnels) ---

    async listResources(): Promise<PangolinResource[]> {
      const data = (await request('GET', `/org/${orgId}/resources?limit=1000&offset=0`)) as {
        data?: { resources?: PangolinResource[] };
      };
      return data?.data?.resources ?? [];
    },

    async deleteResource(resourceId: string | number): Promise<void> {
      await request('DELETE', `/resource/${resourceId}`);
    },

    // --- Sites (workers) ---

    async listSites(): Promise<PangolinSite[]> {
      const data = (await request('GET', `/org/${orgId}/sites`)) as {
        data?: { sites?: PangolinSite[] };
      };
      return data?.data?.sites ?? [];
    },

    async createSite(name: string): Promise<{ siteId: string; secret: string }> {
      const data = (await request('PUT', `/org/${orgId}/site`, {
        name,
        type: 'newt',
      })) as { data: { siteId: string; secret: string } };
      return data.data;
    },

    async deleteSite(siteId: string | number): Promise<void> {
      await request('DELETE', `/org/${orgId}/site/${siteId}`);
    },

    // --- Domains ---

    async listDomains(): Promise<PangolinDomain[]> {
      const data = (await request('GET', `/org/${orgId}/domains?limit=100&offset=0`)) as {
        data?: { domains?: PangolinDomain[] };
      };
      return data?.data?.domains ?? [];
    },

    // --- Users ---

    async listUsers(): Promise<PangolinUser[]> {
      const data = (await request('GET', `/org/${orgId}/users?limit=100&offset=0`)) as {
        data?: { users?: PangolinUser[] };
      };
      return data?.data?.users ?? [];
    },

    async inviteUser(email: string, roleId?: string): Promise<void> {
      await request('POST', `/org/${orgId}/user/invite`, {
        email,
        ...(roleId ? { roleId } : {}),
      });
    },

    async removeUser(userId: string): Promise<void> {
      await request('DELETE', `/org/${orgId}/user/${userId}`);
    },

    // --- Identity Providers ---

    async listIdps(): Promise<PangolinIdp[]> {
      const data = (await request('GET', `/org/${orgId}/idp`)) as {
        data?: { idps?: PangolinIdp[] };
      };
      return data?.data?.idps ?? [];
    },

    async createOidcIdp(config: {
      name: string;
      clientId: string;
      clientSecret: string;
      authUrl: string;
      tokenUrl: string;
      scopes?: string;
      emailPath?: string;
      namePath?: string;
      identifierPath?: string;
    }): Promise<{ idpId: number }> {
      const data = (await request('PUT', `/org/${orgId}/idp`, {
        name: config.name,
        type: 'oidc',
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authorizationUrl: config.authUrl,
        tokenUrl: config.tokenUrl,
        scopes: config.scopes ?? 'openid profile email',
        emailPath: config.emailPath ?? 'email',
        namePath: config.namePath ?? 'name',
        identifierPath: config.identifierPath ?? 'sub',
      })) as { data: { idpId: number } };
      return data.data;
    },

    async deleteIdp(idpId: number): Promise<void> {
      await request('DELETE', `/org/${orgId}/idp/${idpId}`);
    },

    // --- Status ---

    async status(): Promise<{ reachable: boolean; orgId: string }> {
      try {
        await request('GET', `/org/${orgId}`);
        return { reachable: true, orgId };
      } catch {
        return { reachable: false, orgId };
      }
    },
  };
}

export type PangolinAdmin = ReturnType<typeof createPangolinAdmin>;
