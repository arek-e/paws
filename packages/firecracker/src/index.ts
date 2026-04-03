// Errors
export { FirecrackerError, FirecrackerErrorCode } from './errors.js';

// Types
export type { ExecFn, RequestFn, VmHandle } from './types.js';

// Client
export { createFirecrackerClient } from './client.js';
export type {
  DriveConfig,
  FirecrackerClient,
  MachineConfig,
  NetworkInterfaceConfig,
  SnapshotLoadConfig,
} from './client.js';

// Network
export { allocateSubnet, createIpPool } from './network/ip-pool.js';
export type { FirecrackerAllocation } from './network/ip-pool.js';
export { createPortPool } from './network/port-pool.js';
export type { PortPool } from './network/port-pool.js';
export { createTap, deleteTap } from './network/tap.js';
export type { IptablesConfig } from './network/iptables.js';
export {
  setupIptables,
  setupInboundPort,
  teardownIptables,
  teardownInboundPort,
} from './network/iptables.js';

// VM lifecycle
export { restoreVm } from './vm/restore.js';
export type { RestoreOptions, SpawnFn } from './vm/restore.js';
export { stopVm } from './vm/stop.js';
export type { StopOptions } from './vm/stop.js';
