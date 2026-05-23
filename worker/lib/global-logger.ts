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

const LOGGER_CONSTANTS = {
  PRIORITY_DEBUG: 0,
  PRIORITY_INFO: 1,
  PRIORITY_WARN: 2,
  PRIORITY_ERROR: 3,
} as const;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: LOGGER_CONSTANTS.PRIORITY_DEBUG,
  info: LOGGER_CONSTANTS.PRIORITY_INFO,
  warn: LOGGER_CONSTANTS.PRIORITY_WARN,
  error: LOGGER_CONSTANTS.PRIORITY_ERROR,
};

let minLevel: LogLevel = "info";
let globalContext: LogContext = {};

/**
 * Sets the minimum log level for the global logger.
 * Only messages with a priority equal to or higher than the specified level will be logged.
 *
 * @param level - The minimum log level to set ("debug", "info", "warn", "error").
 */
export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

/**
 * Sets the global context that will be attached to all subsequent log entries.
 * This context is merged with the existing global context and any local context provided during logging.
 *
 * @param context - The context object containing additional metadata to include in logs.
 */
export function setLogContext(context: LogContext): void {
  globalContext = { ...globalContext, ...context };
}

/**
 * Clears all previously set global context.
 * Subsequent logs will only contain local context if provided.
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

export const logger = {
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
};
