/**
 * Lightweight structured logger for bot modules.
 *
 * Mirrors `worker/lib/global-logger.ts` API surface so that existing
 * `logger.info / .warn / .error / .debug` call sites in bot modules work
 * unchanged. Kept in the bot tier so bots do not pull Cloudflare-only
 * worker code; if `worker/lib/global-logger.ts` ever grows a Cloudflare
 * binding import, this shim keeps the bot layer insulated.
 *
 * Pure Node runtime (no `console` shimming, no KV/Env). Output goes to
 * stdout/stderr via `console.*` underneath so Cloudflare Workers logs
 * and Node process logs both pick it up unchanged.
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

let minLevel: LogLevel = "info";
let globalContext: LogContext = {};

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

export function setLogContext(context: LogContext): void {
  globalContext = { ...globalContext, ...context };
}

export function clearLogContext(): void {
  globalContext = {};
}

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

  const output =
    Object.keys(merged).length > 0
      ? JSON.stringify(entry)
      : `[${entry.timestamp}] ${level.toUpperCase()} ${message}`;

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
