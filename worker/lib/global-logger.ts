/**
 * Factory for per-tier structured loggers at the Worker tier.
 *
 * Mirrors `bot/lib/logger.ts`: replaces the prior module-singleton mutable
 * state (`let minLevel` + `let globalContext` at module scope) with a
 * per-instance factory `createLogger(options)` so each consumer owns an
 * independent Logger with its own level and context. This eliminates the
 * module-level mutable state concern surfaced by reviewers — `setMinLevel`
 * / `setContext` calls in one consumer no longer leak into another within
 * the same Node / Worker isolate.
 *
 * Public API:
 *   - `createLogger(options)` returns a Logger (factory, no shared state)
 *   - `logger` is a default-instance Logger with `component: "worker-global"`
 *     for backward compatibility with the 80+ `import { logger }` callers
 *     across `worker/**` and `tests/**`
 *
 * Logger interface (per instance):
 *   - debug / info / warn / error(message, context?)
 *   - setMinLevel(level) / setContext(ctx) / clearContext()
 *
 * Output goes to stdout / stderr via `console.*` underneath, so
 * Cloudflare Workers logs and Node process logs both pick it up unchanged.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  component?: string;
  run_id?: string;
  trace_id?: string;
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

/**
 * Single-sourced console routing for all logging paths.
 * `error` goes to stderr, `warn` to console.warn, everything else to stdout.
 * Used by `createLogger` and by `worker/lib/logger/structured.ts` so the
 * level-to-method mapping cannot drift between the two emitters.
 */
export function emitConsole(level: LogLevel, output: string): void {
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
 * bundled sub-object; it takes precedence over fields set at the top level.
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

    emitConsole(level, output);
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

/**
 * Internal default-instance logger. Owns one well-defined piece of global
 * state (the `"worker-global"` component) so JSON-tagged entries
 * distinguish worker-tier logs from bot-tier logs without further context
 * plumbing. Consumers must not mutate this directly; use
 * `createLogger({ ... })` for tunable per-instance loggers.
 */
const _defaultLogger = createLogger({ component: "worker-global" });

/**
 * Default logger instance for backward compatibility with the 80+ existing
 * `import { logger }` callers. The exposed surface keeps the full `Logger`
 * type so future helper functions can accept it as a parameter
 * polymorphically; however, the three runtime-tuning methods
 * (`setMinLevel`, `setContext`, `clearContext`) throw deliberately if
 * called on the default instance. This closes the module-singleton
 * mutable-state leak that motivated the factory rewrite for the underlying
 * instance — callers wanting tunable state must use `createLogger({...})`.
 * The returned object is `Object.freeze`d so attempts to extend the
 * surface at runtime throw in strict mode.
 */
export const logger: Logger = Object.freeze({
  debug: _defaultLogger.debug,
  info: _defaultLogger.info,
  warn: _defaultLogger.warn,
  error: _defaultLogger.error,
  setMinLevel(_level: LogLevel): void {
    throw new Error(
      "default logger is read-only; use createLogger({ ... }) for tunables",
    );
  },
  setContext(_context: LogContext): void {
    throw new Error(
      "default logger is read-only; use createLogger({ ... }) for tunables",
    );
  },
  clearContext(): void {
    throw new Error(
      "default logger is read-only; use createLogger({ ... }) for tunables",
    );
  },
});
