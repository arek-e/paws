// Errors
export { WorkerError, WorkerErrorCode } from './errors.js';

// Semaphore
export { createSemaphore } from './semaphore.js';
export type { Semaphore } from './semaphore.js';

// SSH
export { waitForSsh, sshExec, sshWriteFile, sshReadFile } from './ssh/client.js';
export type { SshExecResult, SshOptions } from './ssh/client.js';

// Proxy
export { matchesDomain, findCredentials } from './proxy/domain-match.js';
export { generateSessionCa } from './proxy/ca.js';
export type { SessionCa, CaOptions } from './proxy/ca.js';
export { createProxy } from './proxy/server.js';
export type { ProxyConfig, ProxyHandle } from './proxy/server.js';

// Session executor
export { createExecutor } from './session/executor.js';
export type { ExecutorConfig, SessionResult, ActiveSession, Executor } from './session/executor.js';

// Routes
export { createSessionApp } from './routes.js';
export type { AppDeps } from './routes.js';
