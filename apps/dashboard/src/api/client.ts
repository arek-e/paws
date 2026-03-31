import type { Session, SessionListResponse } from '@paws/domain-session';
import type { BrowserAction, ScreenshotResponse } from '@paws/domain-browser';
import type { FleetOverview, WorkerListResponse } from '@paws/domain-fleet';
import type { SnapshotConfig } from '@paws/domain-snapshot';
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

// --- Provisioning ---

export interface ProviderField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'select';
  placeholder?: string;
  options?: { value: string; label: string }[];
  hint?: string;
}

export interface Provider {
  name: string;
  label: string;
  description: string;
  fields: ProviderField[];
}

export interface ProvisionStatus {
  serverId: string;
  name: string;
  ip: string;
  status: string;
  provider: string;
  error?: string;
  createdAt: string;
}

export async function getProviders(): Promise<Provider[]> {
  const res = await fetch('/v1/provisioning/providers', { headers: apiKeyHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch providers: ${res.status}`);
  const body = (await res.json()) as { providers: Provider[] };
  return body.providers;
}

export async function provisionServer(body: Record<string, string>): Promise<{ serverId: string }> {
  const res = await fetch('/v1/provisioning/provision', {
    method: 'POST',
    headers: apiKeyHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: { message?: string } }).error?.message ?? `Server error: ${res.status}`,
    );
  }
  return (await res.json()) as { serverId: string };
}

export async function getProvisioningStatus(id: string): Promise<ProvisionStatus> {
  const res = await fetch(`/v1/provisioning/${id}/status`, { headers: apiKeyHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch provisioning status: ${res.status}`);
  return (await res.json()) as ProvisionStatus;
}

// --- Daemon Templates ---

export interface DaemonTemplate {
  id: string;
  name: string;
  description: string;
  category: 'code-review' | 'devops' | 'security' | 'general';
  icon: string;
  defaults: Record<string, unknown>;
}

export async function getTemplates(category?: string): Promise<DaemonTemplate[]> {
  const params = category ? `?category=${encodeURIComponent(category)}` : '';
  const res = await fetch(`/v1/templates${params}`, { headers: apiKeyHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch templates: ${res.status}`);
  const body = (await res.json()) as { templates: DaemonTemplate[] };
  return body.templates;
}

export async function getTemplate(id: string): Promise<DaemonTemplate> {
  const res = await fetch(`/v1/templates/${encodeURIComponent(id)}`, {
    headers: apiKeyHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch template: ${res.status}`);
  return (await res.json()) as DaemonTemplate;
}

export async function deployTemplate(
  id: string,
  overrides?: { role?: string; snapshot?: string; overrides?: Record<string, unknown> },
): Promise<{ role: string; status: string; createdAt: string; templateId: string }> {
  const res = await fetch(`/v1/templates/${encodeURIComponent(id)}/deploy`, {
    method: 'POST',
    headers: apiKeyHeaders(),
    body: JSON.stringify(overrides ?? {}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      (body as { error?: { message?: string } }).error?.message ??
      `Failed to deploy template: ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

// --- MCP Servers ---

export interface McpServerInfo {
  name: string;
  transport: 'stdio' | 'sse' | 'streamable-http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export async function getMcpServers(): Promise<McpServerInfo[]> {
  const res = await fetch('/v1/mcp/servers', { headers: apiKeyHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch MCP servers: ${res.status}`);
  const body = (await res.json()) as { servers: McpServerInfo[] };
  return body.servers;
}

export async function addMcpServer(config: McpServerInfo): Promise<void> {
  const res = await fetch('/v1/mcp/servers', {
    method: 'POST',
    headers: apiKeyHeaders(),
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: { message?: string } }).error?.message ??
        `Failed to add MCP server: ${res.status}`,
    );
  }
}

export async function deleteMcpServer(name: string): Promise<void> {
  const res = await fetch(`/v1/mcp/servers/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: apiKeyHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete MCP server: ${res.status}`);
}

// --- Audit Log ---

export interface AuditEvent {
  id: string;
  timestamp: string;
  category: 'session' | 'daemon' | 'server' | 'auth' | 'system';
  action: string;
  actor?: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  severity: 'info' | 'warn' | 'error';
}

export interface AuditFilters {
  category?: string;
  action?: string;
  severity?: string;
  search?: string;
  limit?: number;
  offset?: number;
  since?: string;
  until?: string;
}

export interface AuditStats {
  last24h: Record<string, number>;
  last7d: Record<string, number>;
  total: number;
}

export async function getAuditEvents(
  filters?: AuditFilters,
): Promise<{ events: AuditEvent[]; total: number }> {
  const params = new URLSearchParams();
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') {
        params.set(key, String(value));
      }
    }
  }
  const qs = params.toString();
  const res = await fetch(`/v1/audit${qs ? `?${qs}` : ''}`, { headers: apiKeyHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch audit events: ${res.status}`);
  return res.json();
}

export async function getAuditStats(): Promise<AuditStats> {
  const res = await fetch('/v1/audit/stats', { headers: apiKeyHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch audit stats: ${res.status}`);
  return res.json();
}

// --- Browser (computer-use) ---

export async function takeBrowserScreenshot(sessionId: string): Promise<ScreenshotResponse> {
  const res = await fetch(`/v1/sessions/${sessionId}/browser/screenshot`, {
    headers: apiKeyHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to capture screenshot: ${res.status}`);
  return res.json();
}

export async function executeBrowserAction(
  sessionId: string,
  action: BrowserAction,
): Promise<void> {
  const res = await fetch(`/v1/sessions/${sessionId}/browser/action`, {
    method: 'POST',
    headers: apiKeyHeaders(),
    body: JSON.stringify(action),
  });
  if (!res.ok) throw new Error(`Failed to execute browser action: ${res.status}`);
}

// --- Settings ---

export interface AccountInfo {
  email: string;
}

export interface SessionInfo {
  tokenPrefix: string;
  email: string;
  expiresAt: number;
  isCurrent: boolean;
}

export interface SystemInfo {
  version: string;
  commit: string;
  buildDate: string;
  uptime: number;
  workers: number;
  daemons: number;
  authSessions: number;
  activeSessions: number;
  dbSizeBytes: number | null;
}

function credentialFetchOpts(): RequestInit {
  return { credentials: 'include', headers: apiKeyHeaders() };
}

export async function getAccount(): Promise<AccountInfo> {
  const res = await fetch('/v1/settings/account', credentialFetchOpts());
  if (!res.ok) throw new Error(`Failed to fetch account: ${res.status}`);
  return res.json();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch('/v1/settings/change-password', {
    method: 'POST',
    credentials: 'include',
    headers: apiKeyHeaders(),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg =
      (data as { error?: { message?: string } }).error?.message ??
      `Failed to change password: ${res.status}`;
    throw new Error(msg);
  }
}

export async function getActiveSessions(): Promise<SessionInfo[]> {
  const res = await fetch('/v1/settings/sessions', credentialFetchOpts());
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
  const body = (await res.json()) as { sessions: SessionInfo[] };
  return body.sessions;
}

export async function revokeSession(tokenPrefix: string): Promise<void> {
  const res = await fetch(`/v1/settings/sessions/${encodeURIComponent(tokenPrefix)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: apiKeyHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to revoke session: ${res.status}`);
}

export async function revokeOtherSessions(): Promise<void> {
  const res = await fetch('/v1/settings/sessions', {
    method: 'DELETE',
    credentials: 'include',
    headers: apiKeyHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to revoke sessions: ${res.status}`);
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const res = await fetch('/v1/settings/info', credentialFetchOpts());
  if (!res.ok) throw new Error(`Failed to fetch system info: ${res.status}`);
  return res.json();
}

// --- Cloud Connections (AWS integration) ---

export interface CloudConnection {
  id: string;
  provider: 'aws-ec2';
  name: string;
  region: string;
  status: 'connected' | 'error';
  error?: string;
  lastSyncAt?: string;
  createdAt: string;
}

export async function getCloudConnections(): Promise<CloudConnection[]> {
  const res = await fetch('/v1/cloud-connections', { headers: apiKeyHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch cloud connections: ${res.status}`);
  const body = (await res.json()) as { connections: CloudConnection[] };
  return body.connections;
}

export async function createCloudConnection(body: {
  provider: 'aws-ec2';
  name: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}): Promise<CloudConnection & { existingInstances: number }> {
  const res = await fetch('/v1/cloud-connections', {
    method: 'POST',
    headers: apiKeyHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: { message?: string } }).error?.message ??
        `Failed to create connection: ${res.status}`,
    );
  }
  return res.json();
}

export async function deleteCloudConnection(id: string): Promise<void> {
  const res = await fetch(`/v1/cloud-connections/${id}`, {
    method: 'DELETE',
    headers: apiKeyHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete connection: ${res.status}`);
}

export async function syncCloudConnection(id: string): Promise<{
  instances: { id: string; name: string; status: string; ip: string | null }[];
  syncedAt: string;
}> {
  const res = await fetch(`/v1/cloud-connections/${id}/sync`, {
    method: 'POST',
    headers: apiKeyHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: { message?: string } }).error?.message ?? `Sync failed: ${res.status}`,
    );
  }
  return res.json();
}
