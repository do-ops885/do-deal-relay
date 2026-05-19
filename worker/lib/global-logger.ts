// ============================================================================
// Global Structured Logger
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
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

let minLevel: LogLevel = "info";
let globalContext: LogContext = {};

/**
 * Set minimum log level for the global logger.
 *
 * @param level - The minimum level to log (debug, info, warn, error).
 */
export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

/**
 * Set global context attached to all subsequent log entries.
 * Merges with existing global context.
 *
 * @param context - The context object to merge into the global context.
 */
export function setLogContext(context: LogContext): void {
  globalContext = { ...globalContext, ...context };
}

/**
 * Clear all global context associated with the logger.
 */
export function clearLogContext(): void {
  globalContext = {};
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

function formatEntry(entry: LogEntry): string {
  if (entry.context && Object.keys(entry.context).length > 0) {
    return JSON.stringify(entry);
  }
  return `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.message}`;
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

  const output = formatEntry(entry);

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

/**
 * Global structured logger providing standard log levels and context support.
 */
export const logger = {
  /**
   * Log a debug message.
   * @param message - The log message.
   * @param context - Optional local context for this log entry.
   */
  debug(message: string, context?: LogContext): void {
    log("debug", message, context);
  },
  /**
   * Log an info message.
   * @param message - The log message.
   * @param context - Optional local context for this log entry.
   */
  info(message: string, context?: LogContext): void {
    log("info", message, context);
  },
  /**
   * Log a warning message.
   * @param message - The log message.
   * @param context - Optional local context for this log entry.
   */
  warn(message: string, context?: LogContext): void {
    log("warn", message, context);
  },
  /**
   * Log an error message.
   * @param message - The log message.
   * @param context - Optional local context for this log entry.
   */
  error(message: string, context?: LogContext): void {
    log("error", message, context);
  },
};
