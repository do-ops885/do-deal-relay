/**
 * Factory for per-bot structured loggers.
 *
 * Mirrors `worker/lib/global-logger.ts` API surface (debug / info / warn /
 * error) but uses a factory pattern so each bot module owns an
 * independent logger with its own `minLevel` and `context`. This
 * eliminates the module-level mutable state concern surfaced by
 * reviewers — `setMinLevel` / `setContext` calls in one bot no longer
 * leak into another.
 *
 * Pure Node runtime (no `console` shimming, no KV / Env). Output goes to
 * stdout / stderr via `console.*` underneath, so Cloudflare Workers
 * logs and Node process logs both pick it up unchanged.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  component?: string;
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  setMinLevel(level: LogLevel): void;
  setContext(context: LogContext): void;
  clearContext(): void;
}

/**
 * Logger construction options. Extends LogContext so callers can pass
 * `component` (and other context fields) directly on the options object
 * — the most ergonomic shape for the common case. Use `context` for a
 * bundled sub-object; it takes precedence over fields set at the top.
 */
export interface LoggerOptions extends LogContext {
  /** Initial log level. Defaults to "info". */
  minLevel?: LogLevel;
  /**
   * Optional explicit context that takes precedence over fields set
   * directly on the options object.
   */
  context?: LogContext;
}

/**
 * Create a new logger instance with encapsulated state. Each call returns
 * an independent Logger — there is no shared module-level state.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const { context, ...topLevel } = options;
  let minLevel: LogLevel = options.minLevel ?? "info";
  let globalContext: LogContext = { ...topLevel, ...context };

  function shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
  }

  function log(level: LogLevel, message: string, context?: LogContext): void {
    if (!shouldLog(level)) return;

    const merged = { ...globalContext, ...context };
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: Object.keys(merged).length > 0 ? merged : undefined,
    };

    const hasContext =
      entry.context !== undefined && Object.keys(entry.context).length > 0;
    const output = hasContext
      ? JSON.stringify(entry)
      : `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.message}`;

    switch (level) {
      case "error":
        console.error(output);
        break;
      case "warn":
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  return {
    debug(message: string, context?: LogContext): void {
      log("debug", message, context);
    },
    info(message: string, context?: LogContext): void {
      log("info", message, context);
    },
    warn(message: string, context?: LogContext): void {
      log("warn", message, context);
    },
    error(message: string, context?: LogContext): void {
      log("error", message, context);
    },
    setMinLevel(level: LogLevel): void {
      minLevel = level;
    },
    setContext(context: LogContext): void {
      globalContext = { ...globalContext, ...context };
    },
    clearContext(): void {
      globalContext = {};
    },
  };
}
