import { context, propagation, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Context, MiddlewareHandler } from 'hono';

import { getTracer } from './tracing.js';

/**
 * Hono middleware that creates a span for each HTTP request.
 *
 * Extracts incoming W3C trace context (traceparent header) so child spans
 * link to the caller's trace. Sets standard HTTP semantic convention attributes.
 */
export function tracingMiddleware(serviceName?: string): MiddlewareHandler {
  return async (c: Context, next) => {
    const tracer = getTracer(serviceName ?? 'http');

    // Extract trace context from incoming request headers
    const carrier: Record<string, string> = {};
    c.req.raw.headers.forEach((value, key) => {
      carrier[key] = value;
    });
    const parentContext = propagation.extract(context.active(), carrier);

    const method = c.req.method;
    const url = new URL(c.req.url);
    const route = url.pathname;

    await context.with(parentContext, async () => {
      const span = tracer.startSpan(
        `${method} ${route}`,
        {
          kind: SpanKind.SERVER,
          attributes: {
            'http.request.method': method,
            'url.path': route,
            'url.scheme': url.protocol.replace(':', ''),
            'server.port': parseInt(url.port || '0', 10) || undefined,
            'url.query': url.search || undefined,
          },
        },
        context.active(),
      );

      const spanContext = trace.setSpan(context.active(), span);

      try {
        await context.with(spanContext, () => next());

        const status = c.res.status;
        span.setAttribute('http.response.status_code', status);

        if (status >= 500) {
          span.setStatus({ code: SpanStatusCode.ERROR });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        if (err instanceof Error) {
          span.recordException(err);
        }
        throw err;
      } finally {
        span.end();
      }
    });
  };
}
