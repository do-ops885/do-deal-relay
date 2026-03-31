import { LogEntry, LogEntrySchema } from '../types';
import type { Env, PipelinePhase } from '../types';

// ============================================================================
// Append-Only JSONL Logger
// ============================================================================

const LOG_KEY_PREFIX = 'log:';
const LOG_INDEX_KEY = 'log:index';

interface LogIndex {
  total_entries: number;
  last_entry_key: string;
  last_run_id: string;
}

/**
 * Append log entry to KV storage
 * Uses sequential indexing for retrieval
 */
export async function appendLog(
  env: Env,
  entry: Omit<LogEntry, 'ts'>
): Promise<void> {
  const timestamp = new Date().toISOString();
  const logEntry: LogEntry = {
    ...entry,
    ts: timestamp,
  };

  // Validate entry
  const result = LogEntrySchema.safeParse(logEntry);
  if (!result.success) {
    console.error('Invalid log entry:', result.error);
    throw new Error(`Invalid log entry: ${result.error.message}`);
  }

  try {
    // Get current index
    const index = await env.DEALS_LOG.get<LogIndex>(LOG_INDEX_KEY, 'json') || {
      total_entries: 0,
      last_entry_key: '',
      last_run_id: '',
    };

    // Generate entry key
    const entryNumber = index.total_entries + 1;
    const entryKey = `${LOG_KEY_PREFIX}${String(entryNumber).padStart(10, '0')}`;

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
    const runList = await env.DEALS_LOG.get<string[]>(runListKey, 'json') || [];
    runList.push(entryKey);
    await env.DEALS_LOG.put(runListKey, JSON.stringify(runList));
  } catch (error) {
    console.error('Failed to append log:', error);
    throw new Error(`Log append failed: ${(error as Error).message}`);
  }
}

/**
 * Get log entries for a specific run
 */
export async function getRunLogs(
  env: Env,
  run_id: string
): Promise<LogEntry[]> {
  try {
    const runListKey = `run:${run_id}`;
    const entryKeys = await env.DEALS_LOG.get<string[]>(runListKey, 'json');

    if (!entryKeys || entryKeys.length === 0) {
      return [];
    }

    const entries: LogEntry[] = [];
    for (const key of entryKeys) {
      const entry = await env.DEALS_LOG.get<LogEntry>(key, 'json');
      if (entry) {
        entries.push(entry);
      }
    }

    // Sort by timestamp
    return entries.sort(
      (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
    );
  } catch (error) {
    console.error('Failed to get run logs:', error);
    return [];
  }
}

/**
 * Get recent log entries (last N)
 */
export async function getRecentLogs(
  env: Env,
  count: number = 100
): Promise<LogEntry[]> {
  try {
    const index = await env.DEALS_LOG.get<LogIndex>(LOG_INDEX_KEY, 'json');

    if (!index || index.total_entries === 0) {
      return [];
    }

    const entries: LogEntry[] = [];
    const startEntry = Math.max(1, index.total_entries - count + 1);

    for (let i = startEntry; i <= index.total_entries; i++) {
      const key = `${LOG_KEY_PREFIX}${String(i).padStart(10, '0')}`;
      const entry = await env.DEALS_LOG.get<LogEntry>(key, 'json');
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  } catch (error) {
    console.error('Failed to get recent logs:', error);
    return [];
  }
}

/**
 * Create a log entry builder for fluent logging
 */
export function createLogBuilder(
  run_id: string,
  trace_id: string
): LogBuilder {
  return new LogBuilder(run_id, trace_id);
}

class LogBuilder {
  private entry: Partial<LogEntry>;

  constructor(run_id: string, trace_id: string) {
    this.entry = {
      run_id,
      trace_id,
      status: 'complete',
      retry_count: 0,
      notification_sent: false,
    };
  }

  phase(phase: PipelinePhase): this {
    this.entry.phase = phase;
    return this;
  }

  status(status: LogEntry['status']): this {
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
    this.entry.status = 'error';
    return this;
  }

  build(): Omit<LogEntry, 'ts'> {
    return this.entry as Omit<LogEntry, 'ts'>;
  }
}

/**
 * Export logs as JSONL format
 */
export async function exportLogsAsJSONL(env: Env): Promise<string> {
  const entries = await getRecentLogs(env, 10000);
  return entries.map((e) => JSON.stringify(e)).join('\n');
}
