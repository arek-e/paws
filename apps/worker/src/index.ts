// Errors
export { WorkerError, WorkerErrorCode } from './errors.js';

// Semaphore
export { createSemaphore } from './semaphore.js';
export type { Semaphore } from './semaphore.js';

// SSH
export { waitForSsh, sshExec, sshWriteFile, sshReadFile } from './ssh/client.js';
export type { SshExecResult, SshOptions } from './ssh/client.js';

// Proxy (re-exported from @paws/proxy)
export {
  matchesDomain,
  findCredentials,
  findDomainEntry,
  generateSessionCa,
  createProxy,
  ProxyError,
  ProxyErrorCode,
} from '@paws/proxy';
export type { SessionCa, CaOptions, ProxyConfig, ProxyInstance, DomainEntry } from '@paws/proxy';

// Session executor
export { createExecutor } from './session/executor.js';
export type { ExecutorConfig, SessionResult, ActiveSession, Executor } from './session/executor.js';

// Routes
export { createSessionApp } from './routes.js';
export type { AppDeps } from './routes.js';
