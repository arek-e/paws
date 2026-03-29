import type {
  FleetOverview,
  Session,
  SessionListResponse,
  SnapshotConfig,
  WorkerListResponse,
} from '@paws/types';
import { createClient, type PawsClient } from '@paws/sdk';

let _client: PawsClient | null = null;
let _useSession = false;

export function getApiKey(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('paws_api_key') ?? '';
  }
  return (import.meta.env.VITE_PAWS_API_KEY as string) ?? '';
}

export function setApiKey(key: string) {
  localStorage.setItem('paws_api_key', key);
  _client = null;
}

export function setSessionMode(enabled: boolean) {
  _useSession = enabled;
  _client = null;
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

function getClient(): PawsClient {
  if (!_client) {
    // When using OIDC session, create client with empty API key
    // but inject credentials: 'include' in fetch so cookies are sent
    const apiKey = _useSession ? '' : getApiKey();
    const fetchWithCredentials: typeof fetch = (url, init) => {
      return fetch(url, { ...init, credentials: 'include' });
    };
    _client = createClient({
      baseUrl: '',
      apiKey,
      fetch: _useSession ? fetchWithCredentials : undefined,
    });
  }
  return _client;
}

export async function getFleet(): Promise<FleetOverview> {
  const result = await getClient().fleet.overview();
  if (result.isErr()) throw result.error;
  return result.value;
}

export async function getWorkers(): Promise<WorkerListResponse> {
  const result = await getClient().fleet.workers();
  if (result.isErr()) throw result.error;
  return result.value;
}

export async function getSessions(): Promise<SessionListResponse> {
  const result = await getClient().sessions.list({ limit: 50 });
  if (result.isErr()) throw result.error;
  return result.value;
}

export async function getSession(id: string): Promise<Session> {
  const result = await getClient().sessions.get(id);
  if (result.isErr()) throw result.error;
  return result.value;
}

export async function getDaemons(): Promise<{ daemons: unknown[] }> {
  const result = await getClient().daemons.list();
  if (result.isErr()) throw result.error;
  return result.value as { daemons: unknown[] };
}

// --- Snapshot Configs ---

function apiKeyHeaders(): Record<string, string> {
  const key = getApiKey();
  return key
    ? { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export async function getSnapshotConfigs(): Promise<SnapshotConfig[]> {
  const res = await fetch('/v1/snapshot-configs', { headers: apiKeyHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch snapshot configs: ${res.status}`);
  const body = (await res.json()) as { configs: SnapshotConfig[] };
  return body.configs;
}

export async function createSnapshotConfig(config: {
  id: string;
  template?: string;
  setup: string;
  requiredDomains?: string[];
}): Promise<SnapshotConfig> {
  const res = await fetch('/v1/snapshot-configs', {
    method: 'POST',
    headers: apiKeyHeaders(),
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`Failed to create snapshot config: ${res.status}`);
  return (await res.json()) as SnapshotConfig;
}

export async function buildSnapshot(id: string): Promise<void> {
  // Fetch the config to get the setup script, then dispatch build
  const configRes = await fetch(`/v1/snapshot-configs/${id}`, { headers: apiKeyHeaders() });
  const config = configRes.ok ? ((await configRes.json()) as SnapshotConfig) : null;

  const res = await fetch(`/v1/snapshots/${id}/build`, {
    method: 'POST',
    headers: apiKeyHeaders(),
    body: JSON.stringify({
      base: config?.id ?? id,
      setup: config?.setup ?? '',
    }),
  });
  if (!res.ok) throw new Error(`Failed to trigger snapshot build: ${res.status}`);
}
