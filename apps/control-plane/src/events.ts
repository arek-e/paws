// Session events are now provided by @paws/domain-session.
// This file re-exports them for backward compatibility with existing control-plane imports.
export { createSessionEvents } from '@paws/domain-session';
export type { SessionEvents } from '@paws/domain-session';
