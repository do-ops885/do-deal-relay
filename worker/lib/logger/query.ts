import { Env, LogEntry } from "../../types";
import {
  LOG_INDEX_KEY,
  LOG_KEY_PREFIX,
  LogIndex,
  StructuredLogEntry,
  STRUCTURED_LOG_PREFIX,
  TRACE_INDEX_PREFIX,
} from "./types";

/**
 * Helper to fetch KV entries in batches to avoid subrequest limits and improve performance.
 * @param env Worker environment
 * @param keys Keys to fetch
 * @param batchSize Number of concurrent requests (default 25)
 * @returns Array of non-null fetched entries
 */
async function batchFetch<T>(
  env: Env,
  keys: string[],
  batchSize: number = 25,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((key) => env.DEALS_LOG.get<T>(key, "json")),
    );
    for (const res of batchResults) {
      if (res) results.push(res);
    }
  }
  return results;
}

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

    // Optimization: Parallel batch fetch instead of sequential loop
    const entries = await batchFetch<LogEntry>(env, entryKeys);

    return entries.sort(
      (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
    );
  } catch (error) {
    console.error("Failed to get run logs:", error);
    return [];
  }
}

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

    const keysToFetch = logKeys.filter((key) =>
      key.startsWith(STRUCTURED_LOG_PREFIX),
    );

    // Optimization: Parallel batch fetch instead of sequential loop
    const entries = await batchFetch<StructuredLogEntry>(env, keysToFetch);

    return entries.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  } catch (error) {
    console.error("Failed to query logs by run_id:", error);
    return [];
  }
}

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

    // Optimization: Parallel batch fetch instead of sequential loop
    const entries = await batchFetch<StructuredLogEntry>(env, logKeys);

    return entries.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  } catch (error) {
    console.error("Failed to query logs by trace_id:", error);
    return [];
  }
}

export async function getRecentLogs(
  env: Env,
  count: number = 100,
): Promise<LogEntry[]> {
  try {
    const index = await env.DEALS_LOG.get<LogIndex>(LOG_INDEX_KEY, "json");

    if (!index || index.total_entries === 0) {
      return [];
    }

    const startEntry = Math.max(1, index.total_entries - count + 1);
    const keys: string[] = [];

    for (let i = startEntry; i <= index.total_entries; i++) {
      keys.push(`${LOG_KEY_PREFIX}${String(i).padStart(10, "0")}`);
    }

    // Optimization: Parallel batch fetch instead of sequential loop
    const entries = await batchFetch<LogEntry>(env, keys);

    return entries;
  } catch (error) {
    console.error("Failed to get recent logs:", error);
    return [];
  }
}

export async function getRecentStructuredLogs(
  env: Env,
  count: number = 100,
): Promise<StructuredLogEntry[]> {
  try {
    const prefix = STRUCTURED_LOG_PREFIX;
    const listResult = await env.DEALS_LOG.list({ prefix });

    const sortedKeys = listResult.keys
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, count)
      .map((k) => k.name);

    // Optimization: Parallel batch fetch instead of sequential loop
    const logs = await batchFetch<StructuredLogEntry>(env, sortedKeys);

    return logs.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  } catch (error) {
    console.error("Failed to get recent structured logs:", error);
    return [];
  }
}
