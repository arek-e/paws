import { context, propagation, trace, type Span, SpanStatusCode } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export interface TracingConfig {
  serviceName: string;
  serviceVersion?: string;
  /** OTLP endpoint. Defaults to OTEL_EXPORTER_OTLP_ENDPOINT or http://localhost:4318 */
  endpoint?: string;
  /** Use SimpleSpanProcessor (flush immediately) instead of batching. Useful for tests. */
  sync?: boolean;
}

let provider: BasicTracerProvider | undefined;

/**
 * Initialize OpenTelemetry tracing. Call once at service startup, before creating the Hono app.
 * Returns the provider for graceful shutdown.
 */
export function initTracing(config: TracingConfig): BasicTracerProvider {
  if (provider) return provider;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion ?? '0.1.0',
  });

  const endpoint =
    config.endpoint ?? process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4318';

  const exporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
  });

  const Processor = config.sync ? SimpleSpanProcessor : BatchSpanProcessor;

  // Set up context manager before creating the provider
  const contextManager = new AsyncLocalStorageContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);

  // W3C Trace Context propagation (traceparent/tracestate headers)
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  provider = new BasicTracerProvider({
    resource,
    spanProcessors: [new Processor(exporter)],
  });

  // Register as the global tracer provider
  trace.setGlobalTracerProvider(provider);

  return provider;
}

/** Get a tracer by name (typically the package/module name). */
export function getTracer(name: string) {
  return trace.getTracer(name);
}

/** Get the current active span, if any. */
export function activeSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/** Get trace ID from the current active span, or undefined. */
export function activeTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  const ctx = span.spanContext();
  // All-zero trace ID means no valid trace
  if (ctx.traceId === '00000000000000000000000000000000') return undefined;
  return ctx.traceId;
}

/** Get span ID from the current active span, or undefined. */
export function activeSpanId(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  return span.spanContext().spanId;
}

/**
 * Inject W3C trace context headers into an outbound request.
 * Use this when making HTTP calls between services to propagate traces.
 */
export function injectTraceHeaders(headers: Record<string, string> = {}): Record<string, string> {
  propagation.inject(context.active(), headers);
  return headers;
}

/** Record an error on the active span. */
export function recordError(error: Error): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }
}

/** Gracefully shut down the tracer provider. Call on SIGTERM. */
export async function shutdownTracing(): Promise<void> {
  if (provider) {
    await provider.shutdown();
    provider = undefined;
  }
}
