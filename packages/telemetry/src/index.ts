export {
  initTracing,
  getTracer,
  activeSpan,
  activeTraceId,
  activeSpanId,
  injectTraceHeaders,
  recordError,
  shutdownTracing,
} from './tracing.js';
export type { TracingConfig } from './tracing.js';

export { tracingMiddleware } from './middleware.js';

// Re-export commonly used OTel API types for convenience
export { SpanStatusCode, SpanKind } from '@opentelemetry/api';
export type { Span } from '@opentelemetry/api';
