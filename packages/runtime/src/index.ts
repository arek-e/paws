export { PawsError, RuntimeError, RuntimeErrorCode } from './errors.js';
export type { RuntimeErrorCode as RuntimeErrorCodeType } from './errors.js';

export { createRuntimeRegistry } from './registry.js';
export type { RuntimeRegistry } from './registry.js';

export type {
  RuntimeAdapter,
  RuntimeCapabilities,
  RuntimeSessionRequest,
  ResolvedCredentials,
  SessionResult,
  ExposedPortResult,
  ExecuteOptions,
  PortExposureProvider,
} from './types.js';
