// Types
export type { ExecFn, DomainEntry, ProxyConfig, ProxyInstance } from './types.js';

// Errors
export { ProxyError, ProxyErrorCode } from './errors.js';

// CA generation
export { generateSessionCa } from './ca.js';
export type { SessionCa, CaOptions } from './ca.js';

// Domain matching
export { matchesDomain, findCredentials, findDomainEntry } from './domain-match.js';

// Proxy server
export { createProxy } from './server.js';
