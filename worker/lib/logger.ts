import { LogEntry, LogEntrySchema } from "../types";
import type { Env, PipelinePhase } from "../types";

// ============================================================================
// Structured Logging with Correlation IDs
// ============================================================================

const LOG_KEY_PREFIX = "log:";
const LOG_INDEX_KEY = "log:index";
const STRUCTURED_LOG_PREFIX = "logs:";
const TRACE_INDEX_PREFIX = "trace:";

interface LogIndex {
  total_entries: number;
  last_entry_key: string;
  last_run_id: string;
}

/**
 * Structured log entry interface for correlation tracking
 */
export interface StructuredLogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  run_id: string;
  trace_id: string;
  phase?: string;
  message: string;
  context?: Record<string, unknown>;
  duration_ms?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Logger interface with structured logging methods
 */
export interface Logger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (
    message: string,
    error?: Error,
    context?: Record<string, unknown>,
  ) => void;
  withPhase: (phase: string) => Logger;
}

/**
 * Internal logger implementation
 */
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

    // Store in KV with key pattern: logs:${run_id}:${timestamp}
    const logKey = `${STRUCTURED_LOG_PREFIX}${this.runId}:${timestamp}`;

    try {
      await this.env.DEALS_LOG.put(logKey, JSON.stringify(entry));

      // Index by trace_id for cross-run correlation
      const traceIndexKey = `${TRACE_INDEX_PREFIX}${this.traceId}`;
      const traceEntries =
        (await this.env.DEALS_LOG.get<string[]>(traceIndexKey, "json")) || [];
      traceEntries.push(logKey);
      await this.env.DEALS_LOG.put(traceIndexKey, JSON.stringify(traceEntries));

      // Maintain run-based index for backward compatibility
      const runListKey = `run:${this.runId}`;
      const runList =
        (await this.env.DEALS_LOG.get<string[]>(runListKey, "json")) || [];
      runList.push(logKey);
      await this.env.DEALS_LOG.put(runListKey, JSON.stringify(runList));

      // Also log to console for immediate visibility
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
    // Fire and forget - don't block execution for logging
    this.log("debug", message, context).catch(() => {});
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context).catch(() => {});
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context).catch(() => {});
  }

  error(
    message: string,
    error?: Error,
    context?: Record<string, unknown>,
  ): void {
    this.log("error", message, context, error).catch(() => {});
  }

  withPhase(phase: string): Logger {
    return new StructuredLogger(this.env, this.runId, this.traceId, phase);
  }
}

/**
 * Create a structured logger with correlation tracking
 *
 * @param env - Cloudflare Worker environment
 * @param run_id - Unique identifier for this pipeline run
 * @param trace_id - Correlation ID for distributed tracing
 * @returns Logger instance with debug/info/warn/error methods and phase scoping
 *
 * @example
 * ```typescript
 * const logger = createStructuredLogger(env, 'run_123', 'trace_abc');
 * logger.info('Pipeline started');
 *
 * const phaseLogger = logger.withPhase('discover');
 * phaseLogger.debug('Found deals', { count: 5 });
 * phaseLogger.error('Discovery failed', error, { url: 'https://...' });
 * ```
 */
export function createStructuredLogger(
  env: Env,
  run_id: string,
  trace_id: string,
): Logger {
  return new StructuredLogger(env, run_id, trace_id);
}

// ============================================================================
// Legacy LogBuilder and appendLog (maintained for backward compatibility)
// ============================================================================

/**
 * Append log entry to KV storage
 * Uses sequential indexing for retrieval
 */
export async function appendLog(
  env: Env,
  entry: Omit<LogEntry, "ts">,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const logEntry: LogEntry = {
    ...entry,
    ts: timestamp,
  };

  // Validate entry
  const result = LogEntrySchema.safeParse(logEntry);
  if (!result.success) {
    console.error("Invalid log entry:", result.error);
    throw new Error(`Invalid log entry: ${result.error.message}`);
  }

  try {
    // Get current index
    const index = (await env.DEALS_LOG.get<LogIndex>(
      LOG_INDEX_KEY,
      "json",
    )) || {
      total_entries: 0,
      last_entry_key: "",
      last_run_id: "",
    };

    // Generate entry key
    const entryNumber = index.total_entries + 1;
    const entryKey = `${LOG_KEY_PREFIX}${String(entryNumber).padStart(10, "0")}`;

    // Store entry
    await env.DEALS_LOG.put(entryKey, JSON.stringify(logEntry));

    // Update index
    const updatedIndex: LogIndex = {
      total_entries: entryNumber,
      last_entry_key: entryKey,
      last_run_id: logEntry.run_id,
    };
    await env.DEALS_LOG.put(LOG_INDEX_KEY, JSON.stringify(updatedIndex));

    // Also maintain a list per run_id for easy retrieval
    const runListKey = `run:${logEntry.run_id}`;
    const runList =
      (await env.DEALS_LOG.get<string[]>(runListKey, "json")) || [];
    runList.push(entryKey);
    await env.DEALS_LOG.put(runListKey, JSON.stringify(runList));
  } catch (error) {
    console.error("Failed to append log:", error);
    throw new Error(`Log append failed: ${(error as Error).message}`);
  }
}

/**
 * Get log entries for a specific run
 */
export async function getRunLogs(
  env: Env,
  run_id: string,
): Promise<LogEntry[]> {
  try {
    const runListKey = `run:${run_id}`;
    const entryKeys = await env.DEALS_LOG.get<string[]>(runListKey, "json");

    if (!entryKeys || entryKeys.length === 0) {
      return [];
    }

    const entries: LogEntry[] = [];
    for (const key of entryKeys) {
      // Handle both legacy and structured log keys
      const entry = await env.DEALS_LOG.get<LogEntry>(key, "json");
      if (entry) {
        entries.push(entry);
      }
    }

    // Sort by timestamp
    return entries.sort(
      (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
    );
  } catch (error) {
    console.error("Failed to get run logs:", error);
    return [];
  }
}

/**
 * Query structured logs by run_id
 * Returns logs in structured format with correlation IDs
 */
export async function queryLogsByRunId(
  env: Env,
  run_id: string,
): Promise<StructuredLogEntry[]> {
  try {
    const runListKey = `run:${run_id}`;
    const logKeys = await env.DEALS_LOG.get<string[]>(runListKey, "json");

    if (!logKeys || logKeys.length === 0) {
      return [];
    }

    const entries: StructuredLogEntry[] = [];
    for (const key of logKeys) {
      // Only process structured log keys
      if (key.startsWith(STRUCTURED_LOG_PREFIX)) {
        const entry = await env.DEALS_LOG.get<StructuredLogEntry>(key, "json");
        if (entry) {
          entries.push(entry);
        }
      }
    }

    // Sort by timestamp
    return entries.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  } catch (error) {
    console.error("Failed to query logs by run_id:", error);
    return [];
  }
}

/**
 * Query structured logs by trace_id (correlation ID)
 * Useful for tracking a request across multiple runs/pipelines
 */
export async function queryLogsByTraceId(
  env: Env,
  trace_id: string,
): Promise<StructuredLogEntry[]> {
  try {
    const traceIndexKey = `${TRACE_INDEX_PREFIX}${trace_id}`;
    const logKeys = await env.DEALS_LOG.get<string[]>(traceIndexKey, "json");

    if (!logKeys || logKeys.length === 0) {
      return [];
    }

    const entries: StructuredLogEntry[] = [];
    for (const key of logKeys) {
      const entry = await env.DEALS_LOG.get<StructuredLogEntry>(key, "json");
      if (entry) {
        entries.push(entry);
      }
    }

    // Sort by timestamp
    return entries.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  } catch (error) {
    console.error("Failed to query logs by trace_id:", error);
    return [];
  }
}

/**
 * Get recent log entries (last N)
 * Returns both legacy and structured logs
 */
export async function getRecentLogs(
  env: Env,
  count: number = 100,
): Promise<LogEntry[]> {
  try {
    const index = await env.DEALS_LOG.get<LogIndex>(LOG_INDEX_KEY, "json");

    if (!index || index.total_entries === 0) {
      return [];
    }

    const entries: LogEntry[] = [];
    const startEntry = Math.max(1, index.total_entries - count + 1);

    for (let i = startEntry; i <= index.total_entries; i++) {
      const key = `${LOG_KEY_PREFIX}${String(i).padStart(10, "0")}`;
      const entry = await env.DEALS_LOG.get<LogEntry>(key, "json");
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  } catch (error) {
    console.error("Failed to get recent logs:", error);
    return [];
  }
}

/**
 * Get recent structured log entries (last N)
 * Returns only structured logs with correlation IDs
 */
export async function getRecentStructuredLogs(
  env: Env,
  count: number = 100,
): Promise<StructuredLogEntry[]> {
  try {
    // List all keys with structured log prefix
    const prefix = STRUCTURED_LOG_PREFIX;
    const logs: StructuredLogEntry[] = [];

    // Note: In production, you'd use a more efficient method
    // For now, we'll scan the most recent entries
    const listResult = await env.DEALS_LOG.list({ prefix });

    // Sort keys by timestamp (descending) and take the last N
    const sortedKeys = listResult.keys
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, count);

    for (const key of sortedKeys) {
      const entry = await env.DEALS_LOG.get<StructuredLogEntry>(
        key.name,
        "json",
      );
      if (entry) {
        logs.push(entry);
      }
    }

    // Sort by timestamp ascending
    return logs.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  } catch (error) {
    console.error("Failed to get recent structured logs:", error);
    return [];
  }
}

/**
 * Create a log entry builder for fluent logging
 */
export function createLogBuilder(run_id: string, trace_id: string): LogBuilder {
  return new LogBuilder(run_id, trace_id);
}

class LogBuilder {
  private entry: Partial<LogEntry>;

  constructor(run_id: string, trace_id: string) {
    this.entry = {
      run_id,
      trace_id,
      status: "complete",
      retry_count: 0,
      notification_sent: false,
    };
  }

  phase(phase: PipelinePhase): this {
    this.entry.phase = phase;
    return this;
  }

  status(status: LogEntry["status"]): this {
    this.entry.status = status;
    return this;
  }

  counts(params: {
    candidate?: number;
    valid?: number;
    duplicate?: number;
    rejected?: number;
  }): this {
    if (params.candidate !== undefined)
      this.entry.candidate_count = params.candidate;
    if (params.valid !== undefined) this.entry.valid_count = params.valid;
    if (params.duplicate !== undefined)
      this.entry.duplicate_count = params.duplicate;
    if (params.rejected !== undefined)
      this.entry.rejected_count = params.rejected;
    return this;
  }

  reasons(reasons: string[]): this {
    this.entry.rejection_reasons = reasons;
    return this;
  }

  scores(params: { confidence?: number; trust?: number }): this {
    if (params.confidence !== undefined)
      this.entry.confidence_score = params.confidence;
    if (params.trust !== undefined) this.entry.trust_score = params.trust;
    return this;
  }

  sources(urls: string[], hashes?: string[]): this {
    this.entry.source_urls = urls;
    if (hashes) this.entry.source_hashes = hashes;
    return this;
  }

  hashes(previous: string, current: string): this {
    this.entry.previous_snapshot_hash = previous;
    this.entry.new_snapshot_hash = current;
    return this;
  }

  duration(ms: number): this {
    this.entry.duration_ms = ms;
    return this;
  }

  retry(count: number): this {
    this.entry.retry_count = count;
    return this;
  }

  versions(validator: string, schema: string): this {
    this.entry.validator_versions = validator;
    this.entry.schema_version = schema;
    return this;
  }

  notify(sent: boolean): this {
    this.entry.notification_sent = sent;
    return this;
  }

  error(errorClass: string, message: string): this {
    this.entry.error_class = errorClass;
    this.entry.error_message = message;
    this.entry.status = "error";
    return this;
  }

  build(): Omit<LogEntry, "ts"> {
    return this.entry as Omit<LogEntry, "ts">;
  }
}

/**
 * Export logs as JSONL format
 */
export async function exportLogsAsJSONL(env: Env): Promise<string> {
  const entries = await getRecentLogs(env, 10000);
  return entries.map((e) => JSON.stringify(e)).join("\n");
}

/**
 * Export structured logs as JSONL format
 */
export async function exportStructuredLogsAsJSONL(env: Env): Promise<string> {
  const entries = await getRecentStructuredLogs(env, 10000);
  return entries.map((e) => JSON.stringify(e)).join("\n");
}
