// ---------------------------------------------------------------------------
// Structured JSON logger
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Pluggable enricher — called on every log emit to add dynamic fields (e.g. trace IDs). */
export type LogEnricher = () => Record<string, unknown>;

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  child(extra: Record<string, unknown>): Logger;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function resolveLogLevel(): LogLevel {
  const env = (typeof process !== 'undefined' && process.env?.LOG_LEVEL) || 'info';
  const normalized = env.toLowerCase();
  if (normalized in LEVEL_ORDER) {
    return normalized as LogLevel;
  }
  return 'info';
}

/**
 * Create a structured JSON logger.
 *
 * @param component - Identifies the source module (e.g. "autoscaler", "proxy")
 * @param baseContext - Extra fields merged into every log entry
 * @param writer - Override where output goes (default: `process.stdout.write`).
 *                 Exposed for testing — production callers should omit this.
 * @param enricher - Called on every emit to add dynamic fields (e.g. trace IDs).
 *                   Set via `setGlobalLogEnricher()` for trace correlation.
 */
export function createLogger(
  component: string,
  baseContext: Record<string, unknown> = {},
  writer: (line: string) => void = (line) => process.stdout.write(line),
  enricher?: LogEnricher,
): Logger {
  const minLevel = resolveLogLevel();
  const enrich = enricher ?? globalEnricher;

  function emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

    const traceFields = enrich ? enrich() : {};

    const entry = {
      ts: new Date().toISOString(),
      level,
      component,
      msg,
      ...traceFields,
      ...baseContext,
      ...ctx,
    };

    writer(`${JSON.stringify(entry)}\n`);
  }

  return {
    debug: (msg, ctx) => emit('debug', msg, ctx),
    info: (msg, ctx) => emit('info', msg, ctx),
    warn: (msg, ctx) => emit('warn', msg, ctx),
    error: (msg, ctx) => emit('error', msg, ctx),
    child(extra) {
      return createLogger(component, { ...baseContext, ...extra }, writer, enrich);
    },
  };
}

// ---------------------------------------------------------------------------
// Global enricher — set once at startup for trace ID correlation
// ---------------------------------------------------------------------------

let globalEnricher: LogEnricher | undefined;

/**
 * Set a global log enricher that runs on every log emit.
 * Call this once at startup after initializing tracing.
 */
export function setGlobalLogEnricher(enricher: LogEnricher): void {
  globalEnricher = enricher;
}
