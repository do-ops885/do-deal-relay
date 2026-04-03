import { Env, LogEntry } from "../../types";
import { fetchInBatches } from "../utils";
import {
  LOG_INDEX_KEY,
  LOG_KEY_PREFIX,
  LogIndex,
  StructuredLogEntry,
  STRUCTURED_LOG_PREFIX,
  TRACE_INDEX_PREFIX,
} from "./types";

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

    // Parallelize log entry fetches in batches of 25 to respect subrequest limits
    const entries = await fetchInBatches(entryKeys, (key) =>
      env.DEALS_LOG.get<LogEntry>(key, "json"),
    );

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

    const structuredLogKeys = logKeys.filter((key) =>
      key.startsWith(STRUCTURED_LOG_PREFIX),
    );

    // Parallelize structured log fetches in batches
    const entries = await fetchInBatches(structuredLogKeys, (key) =>
      env.DEALS_LOG.get<StructuredLogEntry>(key, "json"),
    );

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

    // Parallelize fetches for logs in this trace
    const entries = await fetchInBatches(logKeys, (key) =>
      env.DEALS_LOG.get<StructuredLogEntry>(key, "json"),
    );

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
    const entryKeys: string[] = [];

    for (let i = startEntry; i <= index.total_entries; i++) {
      entryKeys.push(`${LOG_KEY_PREFIX}${String(i).padStart(10, "0")}`);
    }

    // Parallelize fetches for recent logs
    return await fetchInBatches(entryKeys, (key) =>
      env.DEALS_LOG.get<LogEntry>(key, "json"),
    );
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
      .slice(0, count);

    const logNames = sortedKeys.map((key) => key.name);

    // Parallelize fetching recent structured logs in batches
    const logs = await fetchInBatches(logNames, (name) =>
      env.DEALS_LOG.get<StructuredLogEntry>(name, "json"),
    );

    return logs.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  } catch (error) {
    console.error("Failed to get recent structured logs:", error);
    return [];
  }
}
