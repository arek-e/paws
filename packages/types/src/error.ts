import { z } from 'zod';

/** All known paws error codes */
export const ErrorCode = z.enum([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'SESSION_NOT_FOUND',
  'DAEMON_NOT_FOUND',
  'DAEMON_ALREADY_EXISTS',
  'SNAPSHOT_NOT_FOUND',
  'WORKER_NOT_FOUND',
  'CAPACITY_EXHAUSTED',
  'RATE_LIMITED',
  'VALIDATION_ERROR',
  'INTERNAL_ERROR',
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
