import { Env } from "../../types";
import {
  Logger,
  StructuredLogEntry,
  STRUCTURED_LOG_PREFIX,
  TRACE_INDEX_PREFIX,
} from "./types";

class StructuredLogger implements Logger {
  private env: Env;
  private runId: string;
  private traceId: string;
  private currentPhase?: string;
  private startTime: number;

  constructor(env: Env, runId: string, traceId: string, phase?: string) {
    this.env = env;
    this.runId = runId;
    this.traceId = traceId;
    this.currentPhase = phase;
    this.startTime = Date.now();
  }

  private async log(
    level: StructuredLogEntry["level"],
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const duration_ms = Date.now() - this.startTime;

    const entry: StructuredLogEntry = {
      timestamp,
      level,
      run_id: this.runId,
      trace_id: this.traceId,
      phase: this.currentPhase,
      message,
      context,
      duration_ms,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    const logKey = `${STRUCTURED_LOG_PREFIX}${this.runId}:${timestamp}`;

    try {
      await this.env.DEALS_LOG.put(logKey, JSON.stringify(entry));

      const traceIndexKey = `${TRACE_INDEX_PREFIX}${this.traceId}`;
      const traceEntries =
        (await this.env.DEALS_LOG.get<string[]>(traceIndexKey, "json")) || [];
      traceEntries.push(logKey);
      await this.env.DEALS_LOG.put(traceIndexKey, JSON.stringify(traceEntries));

      const runListKey = `run:${this.runId}`;
      const runList =
        (await this.env.DEALS_LOG.get<string[]>(runListKey, "json")) || [];
      runList.push(logKey);
      await this.env.DEALS_LOG.put(runListKey, JSON.stringify(runList));

      const consoleMessage = `[${level.toUpperCase()}] [${this.runId}] [${this.traceId}]${this.currentPhase ? ` [${this.currentPhase}]` : ""} ${message}`;
      if (level === "error") {
        console.error(consoleMessage, context || "", error || "");
      } else if (level === "warn") {
        console.warn(consoleMessage, context || "");
      } else if (level === "debug") {
        console.debug(consoleMessage, context || "");
      } else {
        console.log(consoleMessage, context || "");
      }
    } catch (err) {
      console.error("Failed to write structured log:", err);
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context).catch((err) => {
      console.error(`[LOGGER_FALLBACK] Failed to log: ${message}`, err);
    });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context).catch((err) => {
      console.error(`[LOGGER_FALLBACK] Failed to log: ${message}`, err);
    });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context).catch((err) => {
      console.error(`[LOGGER_FALLBACK] Failed to log: ${message}`, err);
    });
  }

  error(
    message: string,
    error?: Error,
    context?: Record<string, unknown>,
  ): void {
    this.log("error", message, context, error).catch((err) => {
      console.error(`[LOGGER_FALLBACK] Failed to log: ${message}`, err);
    });
  }

  withPhase(phase: string): Logger {
    return new StructuredLogger(this.env, this.runId, this.traceId, phase);
  }
}

export function createStructuredLogger(
  env: Env,
  run_id: string,
  trace_id: string,
): Logger {
  return new StructuredLogger(env, run_id, trace_id);
}
