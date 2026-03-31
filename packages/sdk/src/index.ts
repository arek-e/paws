export { createClient } from './client.js';
export type { ClientConfig, PawsClient, PawsError, PollOptions } from './client.js';
export { PawsApiError, PawsNetworkError } from './errors.js';

// Re-export session types from domain package
export type {
  CancelSessionResponse,
  CreateSessionInput,
  CreateSessionResponse,
  Session,
  SessionListResponse,
  SessionStatus,
} from '@paws/domain-session';

// Re-export non-session types from @paws/types
export type {
  CreateDaemonInput,
  CreateDaemonResponse,
  DaemonDetail,
  DaemonListResponse,
  FleetOverview,
  SnapshotBuildRequest,
  SnapshotBuildResponse,
  SnapshotListResponse,
  UpdateDaemonRequest,
  WebhookTriggerResponse,
  WorkerListResponse,
} from '@paws/types';
