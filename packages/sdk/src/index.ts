export { createClient } from './client.js';
export type { ClientConfig, PawsClient, PawsError, PollOptions } from './client.js';
export { PawsApiError, PawsNetworkError } from './errors.js';

// Re-export types that SDK consumers will need
export type {
  CancelSessionResponse,
  CreateDaemonInput,
  CreateDaemonResponse,
  CreateSessionInput,
  CreateSessionResponse,
  DaemonDetail,
  DaemonListResponse,
  FleetOverview,
  Session,
  SessionListResponse,
  SessionStatus,
  SnapshotBuildRequest,
  SnapshotBuildResponse,
  SnapshotListResponse,
  UpdateDaemonRequest,
  WebhookTriggerResponse,
  WorkerListResponse,
} from '@paws/types';
