// Session routes are now provided by @paws/domain-session.
// This file re-exports them for backward compatibility with existing control-plane imports.
export {
  cancelSessionRoute,
  createSessionRoute,
  getSessionRoute,
  listSessionsRoute,
} from '@paws/domain-session';
