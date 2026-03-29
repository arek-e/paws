// ---------------------------------------------------------------------------
// Structured JSON logger
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

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
 */
export function createLogger(
  component: string,
  baseContext: Record<string, unknown> = {},
  writer: (line: string) => void = (line) => process.stdout.write(line),
): Logger {
  const minLevel = resolveLogLevel();

  function emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

    const entry = {
      ts: new Date().toISOString(),
      level,
      component,
      msg,
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
      return createLogger(component, { ...baseContext, ...extra }, writer);
    },
  };
}
