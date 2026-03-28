/**
 * Thin client for Pangolin's site management API.
 *
 * Used by the autoscaler to auto-create Pangolin sites when provisioning
 * new workers, so Newt can connect immediately without manual dashboard setup.
 */

export interface PangolinClientConfig {
  /** Pangolin internal API URL (e.g., http://pangolin:3001/api/v1). */
  apiUrl: string;
  /** Pangolin API key for authentication. */
  apiKey: string;
  /** Pangolin organization ID. */
  orgId: string;
}

export interface PangolinSiteCreateResult {
  siteId: string;
  secret: string;
  name: string;
}

export interface PangolinClient {
  createSite(name: string): Promise<PangolinSiteCreateResult>;
  deleteSite(siteId: string): Promise<void>;
}

export function createPangolinClient(config: PangolinClientConfig): PangolinClient {
  const { apiUrl, apiKey, orgId } = config;

  async function createSite(name: string): Promise<PangolinSiteCreateResult> {
    const res = await fetch(`${apiUrl}/org/${orgId}/sites`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, type: 'newt' }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Pangolin API error ${res.status}: ${text}`);
    }

    const body = (await res.json()) as {
      data: { siteId: string; secret: string; name: string };
    };

    return body.data;
  }

  async function deleteSite(siteId: string): Promise<void> {
    const res = await fetch(`${apiUrl}/org/${orgId}/sites/${siteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '');
      throw new Error(`Pangolin API error ${res.status}: ${text}`);
    }
  }

  return { createSite, deleteSite };
}
