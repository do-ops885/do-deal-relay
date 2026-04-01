/**
 * Structured Logging Template
 *
 * Correlation ID logging for distributed tracing.
 */

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface LoggerConfig {
  service: string;
  level: LogLevel;
  correlationId?: string;
  traceId?: string;
  format?: "json" | "pretty";
  redact?: string[];
}

export interface LogEntry {
  level: LogLevel;
  time: string;
  service: string;
  correlationId?: string;
  traceId?: string;
  msg: string;
  [key: string]: unknown;
}

export class Logger {
  private config: LoggerConfig;
  private context: Record<string, unknown> = {};

  constructor(config: LoggerConfig) {
    this.config = config;
  }

  child(context: Record<string, unknown>): Logger {
    const child = new Logger(this.config);
    child.context = { ...this.context, ...context };
    return child;
  }

  private log(
    level: LogLevel,
    msg: string,
    data?: Record<string, unknown>,
  ): void {
    if (this.compareLevel(level, this.config.level) < 0) return;

    const entry: LogEntry = {
      level,
      time: new Date().toISOString(),
      service: this.config.service,
      correlationId: this.config.correlationId,
      traceId: this.config.traceId,
      msg,
      ...this.context,
      ...data,
    };

    // Redact sensitive fields
    if (this.config.redact) {
      for (const key of this.config.redact) {
        if (entry[key] !== undefined) {
          entry[key] = "[REDACTED]";
        }
      }
    }

    const output =
      this.config.format === "pretty"
        ? this.formatPretty(entry)
        : JSON.stringify(entry);

    console.log(output);
  }

  private formatPretty(entry: LogEntry): string {
    const time = entry.time.split("T")[1].split(".")[0];
    const levelColor = {
      trace: "\x1b[90m", // gray
      debug: "\x1b[36m", // cyan
      info: "\x1b[32m", // green
      warn: "\x1b[33m", // yellow
      error: "\x1b[31m", // red
    }[entry.level];

    const reset = "\x1b[0m";
    const data = Object.entries(entry)
      .filter(([k]) => !["level", "time", "service", "msg"].includes(k))
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(" ");

    return `[${time}] ${levelColor}${entry.level.toUpperCase()}${reset}: ${entry.msg} ${data}`;
  }

  private compareLevel(a: LogLevel, b: LogLevel): number {
    const levels: LogLevel[] = ["trace", "debug", "info", "warn", "error"];
    return levels.indexOf(a) - levels.indexOf(b);
  }

  trace(msg: string, data?: Record<string, unknown>): void {
    this.log("trace", msg, data);
  }

  debug(msg: string, data?: Record<string, unknown>): void {
    this.log("debug", msg, data);
  }

  info(msg: string, data?: Record<string, unknown>): void {
    this.log("info", msg, data);
  }

  warn(msg: string, data?: Record<string, unknown>): void {
    this.log("warn", msg, data);
  }

  error(msg: string, data?: Record<string, unknown>): void {
    this.log("error", msg, data);
  }
}

// Async context storage for request tracing
export class AsyncContextStore {
  private store = new Map<string, Logger>();

  set(id: string, logger: Logger): void {
    this.store.set(id, logger);
  }

  get(id: string): Logger | undefined {
    return this.store.get(id);
  }

  delete(id: string): void {
    this.store.delete(id);
  }
}

// Request ID generator
export function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// Middleware for automatic correlation IDs
export function createLoggingMiddleware(options: {
  service: string;
  level: LogLevel;
  headerName?: string;
}): (req: Request) => Logger {
  const { service, level, headerName = "x-correlation-id" } = options;

  return (req: Request): Logger => {
    const correlationId =
      req.headers.get(headerName) || generateCorrelationId();
    return new Logger({ service, level, correlationId });
  };
}

// Cloudflare Workers specific helpers
export interface WorkerEnv {
  LOG_LEVEL?: string;
  SERVICE_NAME?: string;
}

export function createWorkerLogger(req: Request, env: WorkerEnv): Logger {
  const correlationId =
    req.headers.get("x-correlation-id") || crypto.randomUUID();
  return new Logger({
    service: env.SERVICE_NAME || "worker",
    level: (env.LOG_LEVEL as LogLevel) || "info",
    correlationId,
    format: "json",
  });
}
