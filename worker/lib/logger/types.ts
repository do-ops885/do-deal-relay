import { LogEntry } from "../../types";

export const LOG_KEY_PREFIX = "log:";
export const LOG_INDEX_KEY = "log:index";
export const STRUCTURED_LOG_PREFIX = "logs:";
export const TRACE_INDEX_PREFIX = "trace:";

export interface LogIndex {
  total_entries: number;
  last_entry_key: string;
  last_run_id: string;
}

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
