/**
 * D1 Client Type Definitions
 *
 * Extracted from client.ts to keep file sizes under the 500-line limit.
 *
 * @module worker/lib/d1/client-types
 */

import type { D1Database } from "@cloudflare/workers-types";

export interface D1ErrorInfo {
  message: string;
  cause?: unknown;
  query?: string;
}

export interface QueryResult<T> {
  success: boolean;
  data?: T[];
  meta?: {
    rows_read: number;
    rows_written: number;
    last_row_id?: number;
    served_by_region?: string;
    served_by_primary?: boolean;
  };
  error?: string;
}

export interface SingleResult<T> {
  success: boolean;
  data?: T | null;
  error?: string;
}

export interface D1ClientConfig {
  enableRetries?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  useSessions?: boolean;
  sessionBookmark?: string;
}

export type D1Session = ReturnType<D1Database["withSession"]>;

export interface D1ResolvedConfig {
  enableRetries: boolean;
  maxRetries: number;
  retryDelayMs: number;
  useSessions: boolean;
  sessionBookmark: string;
}
