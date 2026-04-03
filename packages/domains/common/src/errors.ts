import { z } from 'zod';

/** Generic paws error codes (domain-specific codes live in their own packages) */
export const ErrorCode = z.enum([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'CAPACITY_EXHAUSTED',
  'RATE_LIMITED',
  'VALIDATION_ERROR',
  'INTERNAL_ERROR',
  // Domain-specific codes kept for backward compatibility (prefer domain-specific errors)
  'SESSION_NOT_FOUND',
  'DAEMON_NOT_FOUND',
  'DAEMON_ALREADY_EXISTS',
  'SNAPSHOT_NOT_FOUND',
  'WORKER_NOT_FOUND',
]);

export type ErrorCode = z.infer<typeof ErrorCode>;

/** Standard error response body */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
  }),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
