import type { FleetOverview, Session, SessionListResponse, WorkerListResponse } from '@paws/types';
import { createClient, type PawsClient } from '@paws/sdk';

let _client: PawsClient | null = null;

export function getApiKey(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('paws_api_key') ?? '';
  }
  return (import.meta.env.VITE_PAWS_API_KEY as string) ?? '';
}

export function setApiKey(key: string) {
  localStorage.setItem('paws_api_key', key);
  _client = null; // force re-creation
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

function getClient(): PawsClient {
  if (!_client) {
    _client = createClient({ baseUrl: '', apiKey: getApiKey() });
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
