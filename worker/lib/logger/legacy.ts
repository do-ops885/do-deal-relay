import { Env, LogEntry, LogEntrySchema, PipelinePhase } from "../../types";
import { LOG_INDEX_KEY, LOG_KEY_PREFIX, LogIndex } from "./types";

export async function appendLog(
  env: Env,
  entry: Omit<LogEntry, "ts">,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const logEntry: LogEntry = {
    ...entry,
    ts: timestamp,
  };

  const result = LogEntrySchema.safeParse(logEntry);
  if (!result.success) {
    console.error("Invalid log entry:", result.error);
    throw new Error(`Invalid log entry: ${result.error.message}`);
  }

  try {
    const index = (await env.DEALS_LOG.get<LogIndex>(
      LOG_INDEX_KEY,
      "json",
    )) || {
      total_entries: 0,
      last_entry_key: "",
      last_run_id: "",
    };

    const entryNumber = index.total_entries + 1;
    const entryKey = `${LOG_KEY_PREFIX}${String(entryNumber).padStart(10, "0")}`;

    await env.DEALS_LOG.put(entryKey, JSON.stringify(logEntry));

    const updatedIndex: LogIndex = {
      total_entries: entryNumber,
      last_entry_key: entryKey,
      last_run_id: logEntry.run_id,
    };
    await env.DEALS_LOG.put(LOG_INDEX_KEY, JSON.stringify(updatedIndex));

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

export function createLogBuilder(run_id: string, trace_id: string): LogBuilder {
  return new LogBuilder(run_id, trace_id);
}

export class LogBuilder {
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
