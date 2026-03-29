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

// --- Pangolin Admin ---

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
  type: string;
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

export async function getPangolinStatus(): Promise<{ reachable: boolean; orgId: string }> {
  const res = await fetch('/v1/pangolin/status', { headers: apiKeyHeaders() });
  if (!res.ok) return { reachable: false, orgId: '' };
  return res.json();
}

export async function getPangolinResources(): Promise<PangolinResource[]> {
  const res = await fetch('/v1/pangolin/resources', { headers: apiKeyHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch tunnels: ${res.status}`);
  const body = await res.json();
  return body.resources ?? [];
}

export async function deletePangolinResource(id: string | number): Promise<void> {
  const res = await fetch(`/v1/pangolin/resources/${id}`, {
    method: 'DELETE',
    headers: apiKeyHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete tunnel: ${res.status}`);
}

export async function getPangolinSites(): Promise<PangolinSite[]> {
  const res = await fetch('/v1/pangolin/sites', { headers: apiKeyHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch sites: ${res.status}`);
  const body = await res.json();
  return body.sites ?? [];
}

export async function getPangolinUsers(): Promise<PangolinUser[]> {
  const res = await fetch('/v1/pangolin/users', { headers: apiKeyHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
  const body = await res.json();
  return body.users ?? [];
}

export async function invitePangolinUser(email: string): Promise<void> {
  const res = await fetch('/v1/pangolin/users/invite', {
    method: 'POST',
    headers: apiKeyHeaders(),
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`Failed to invite user: ${res.status}`);
}

export async function removePangolinUser(userId: string): Promise<void> {
  const res = await fetch(`/v1/pangolin/users/${userId}`, {
    method: 'DELETE',
    headers: apiKeyHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to remove user: ${res.status}`);
}

export async function getPangolinIdps(): Promise<PangolinIdp[]> {
  const res = await fetch('/v1/pangolin/idps', { headers: apiKeyHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch IdPs: ${res.status}`);
  const body = await res.json();
  return body.idps ?? [];
}

export async function createPangolinOidcIdp(config: {
  name: string;
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
}): Promise<{ idpId: number }> {
  const res = await fetch('/v1/pangolin/idps/oidc', {
    method: 'POST',
    headers: apiKeyHeaders(),
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`Failed to create IdP: ${res.status}`);
  return res.json();
}

export async function deletePangolinIdp(idpId: number): Promise<void> {
  const res = await fetch(`/v1/pangolin/idps/${idpId}`, {
    method: 'DELETE',
    headers: apiKeyHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete IdP: ${res.status}`);
}

// --- Servers ---

export interface ServerInfo {
  id: string;
  name: string;
  ip: string;
  status: string;
  provider: string;
  createdAt: string;
  error?: string;
}

export interface ValidationCheck {
  label: string;
  status: 'pass' | 'fail' | 'pending';
  message?: string;
}

export interface ValidationResult {
  serverId: string;
  checks: ValidationCheck[];
}

export async function getServers(): Promise<ServerInfo[]> {
  const res = await fetch('/v1/servers', { headers: apiKeyHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch servers: ${res.status}`);
  const body = (await res.json()) as { servers: ServerInfo[] };
  return body.servers;
}

export async function addServer(body: {
  provider: 'manual';
  name: string;
  ip: string;
  password: string;
}): Promise<{ serverId: string }> {
  const res = await fetch('/v1/servers', {
    method: 'POST',
    headers: apiKeyHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: { message?: string } }).error?.message ??
        `Failed to add server: ${res.status}`,
    );
  }
  return (await res.json()) as { serverId: string };
}

export async function deleteServer(id: string): Promise<void> {
  const res = await fetch(`/v1/servers/${id}`, {
    method: 'DELETE',
    headers: apiKeyHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete server: ${res.status}`);
}

export async function validateServer(id: string): Promise<ValidationResult> {
  const res = await fetch(`/v1/servers/${id}/validate`, {
    method: 'POST',
    headers: apiKeyHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to validate server: ${res.status}`);
  return (await res.json()) as ValidationResult;
}
