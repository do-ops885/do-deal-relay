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
 * Set minimum log level
 */
export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

/**
 * Set global context attached to all log entries
 */
export function setLogContext(context: LogContext): void {
  globalContext = { ...globalContext, ...context };
}

/**
 * Clear global context
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
