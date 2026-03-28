import { z } from 'zod';

import { SessionStatus } from './session.js';

/** WebSocket message: current session status */
export const WsStatusMessage = z.object({
  type: z.literal('status'),
  sessionId: z.string(),
  status: SessionStatus,
  startedAt: z.string().optional(),
  worker: z.string().optional(),
});

/** WebSocket message: session completed (terminal) */
export const WsCompleteMessage = z.object({
  type: z.literal('complete'),
  sessionId: z.string(),
  status: SessionStatus,
  exitCode: z.number().optional(),
  durationMs: z.number().optional(),
  output: z.unknown().optional(),
});

/** WebSocket message: error */
export const WsErrorMessage = z.object({
  type: z.literal('error'),
  message: z.string(),
});

/** WebSocket message: streaming output line */
export const WsOutputMessage = z.object({
  type: z.literal('output'),
  stream: z.enum(['stdout', 'stderr']),
  data: z.string(),
});

/** Union of all session WebSocket messages */
export const WsSessionMessage = z.discriminatedUnion('type', [
  WsStatusMessage,
  WsCompleteMessage,
  WsErrorMessage,
  WsOutputMessage,
]);

export type WsSessionMessage = z.infer<typeof WsSessionMessage>;
export type WsStatusMessage = z.infer<typeof WsStatusMessage>;
export type WsCompleteMessage = z.infer<typeof WsCompleteMessage>;
export type WsErrorMessage = z.infer<typeof WsErrorMessage>;
