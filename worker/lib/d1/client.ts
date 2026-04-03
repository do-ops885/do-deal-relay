/**
 * D1 Database Client Wrapper
 * Type-safe query methods with session management, batch support, and error handling
 */

import type {
  D1Database,
  D1PreparedStatement,
} from "@cloudflare/workers-types";

// ============================================================================
// Error Types
// ============================================================================

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

// ============================================================================
// Client Configuration
// ============================================================================

export interface D1ClientConfig {
  enableRetries?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  useSessions?: boolean;
  sessionBookmark?: string;
}

type D1Session = ReturnType<D1Database["withSession"]>;

// ============================================================================
// D1 Client Class
// ============================================================================

export class D1Client {
  private db: D1Database;
  private session: D1Session | undefined;
  private config: {
    enableRetries: boolean;
    maxRetries: number;
    retryDelayMs: number;
    useSessions: boolean;
    sessionBookmark: string;
  };

  constructor(db: D1Database, config: D1ClientConfig = {}) {
    this.db = db;
    this.config = {
      enableRetries: config.enableRetries ?? true,
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 100,
      useSessions: config.useSessions ?? false,
      sessionBookmark: config.sessionBookmark ?? "first-unconstrained",
    };

    if (this.config.useSessions) {
      this.session = db.withSession(this.config.sessionBookmark);
    }
  }

  /**
   * Get the database instance (direct or session-based)
   */
  private getDb(): D1Database | D1Session {
    return this.session || this.db;
  }

  /**
   * Get current session bookmark for read replication
   */
  getBookmark(): string | null {
    return this.session ? this.session.getBookmark() : null;
  }

  // ============================================================================
  // Query Methods with Generics
  // ============================================================================

  /**
   * Execute a SELECT query returning multiple rows
   */
  async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.executeWithRetry<QueryResult<T>>(async () => {
      const stmt = this.getDb().prepare(sql);
      const execResult = await this.bindParams(stmt, params).run<T>();

      return {
        success: true,
        data: execResult.results || [],
        meta: {
          rows_read: execResult.meta?.rows_read || 0,
          rows_written: execResult.meta?.rows_written || 0,
          last_row_id: execResult.meta?.last_row_id,
          served_by_region: execResult.meta?.served_by_region as string,
          served_by_primary: execResult.meta?.served_by_primary,
        },
      };
    }, sql);

    return result;
  }

  /**
   * Execute a SELECT query returning a single row
   */
  async queryFirst<T>(
    sql: string,
    params: unknown[] = [],
  ): Promise<SingleResult<T>> {
    const result = await this.executeWithRetry<SingleResult<T>>(async () => {
      const stmt = this.getDb().prepare(sql);
      const execResult = await this.bindParams(stmt, params).first<T>();

      return {
        success: true,
        data: execResult || null,
      };
    }, sql);

    return result;
  }

  /**
   * Execute an INSERT, UPDATE, or DELETE query
   */
  async execute(
    sql: string,
    params: unknown[] = [],
  ): Promise<{
    success: boolean;
    lastRowId?: number;
    changes?: number;
    error?: string;
  }> {
    const result = await this.executeWithRetry<{
      success: boolean;
      lastRowId?: number;
      changes?: number;
    }>(async () => {
      const stmt = this.getDb().prepare(sql);
      const execResult = await this.bindParams(stmt, params).run();

      return {
        success: true,
        lastRowId: execResult.meta?.last_row_id,
        changes: execResult.meta?.changes,
      };
    }, sql);

    return result;
  }

  /**
   * Execute a raw SQL statement without parameters
   */
  async raw(sql: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.executeWithRetry<{ success: boolean }>(
      async () => {
        // Use direct db for exec (not available on session)
        await (this.db as D1Database).exec(sql);
        return { success: true };
      },
      sql,
    );

    return result;
  }

  // ============================================================================
  // Batch Operations
  // ============================================================================

  /**
   * Execute multiple queries in a batch
   */
  async batch<T>(queries: Array<{ sql: string; params?: unknown[] }>): Promise<{
    success: boolean;
    results: Array<QueryResult<T>>;
    error?: string;
  }> {
    const result = await this.executeWithRetry<{
      success: boolean;
      results: Array<QueryResult<T>>;
    }>(async () => {
      const statements = queries.map((q) => {
        const stmt = this.db.prepare(q.sql);
        return this.bindParams(stmt, q.params || []);
      });

      const batchResults = await this.db.batch<T>(statements);

      const results = batchResults.map((r) => ({
        success: true,
        data: r.results || [],
        meta: {
          rows_read: r.meta?.rows_read || 0,
          rows_written: r.meta?.rows_written || 0,
          last_row_id: r.meta?.last_row_id,
        },
      }));

      return { success: true, results };
    }, "batch");

    return result;
  }

  /**
   * Batch insert multiple rows
   */
  async batchInsert<T extends Record<string, unknown>>(
    table: string,
    rows: T[],
  ): Promise<{ success: boolean; lastRowIds?: number[]; error?: string }> {
    if (rows.length === 0) {
      return { success: true, lastRowIds: [] };
    }

    const firstRow = rows[0];
    const columns = Object.keys(firstRow);
    const placeholders = columns.map(() => "?").join(", ");
    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;

    const queries = rows.map((row) => ({
      sql,
      params: columns.map((col) => row[col]),
    }));

    const result = await this.batch<unknown>(queries);

    if (!result.success || result.error) {
      return { success: false, error: result.error };
    }

    const lastRowIds: number[] = [];
    for (const r of result.results) {
      if (r.meta?.last_row_id !== undefined) {
        lastRowIds.push(r.meta.last_row_id);
      }
    }

    return { success: true, lastRowIds };
  }

  // ============================================================================
  // Prepared Statement Helpers
  // ============================================================================

  /**
   * Create a prepared statement for reuse
   */
  prepare(sql: string): D1PreparedStatement {
    return this.db.prepare(sql);
  }

  /**
   * Execute a prepared statement with parameters
   */
  async runPrepared<T>(
    stmt: D1PreparedStatement,
    params: unknown[],
  ): Promise<QueryResult<T>> {
    const result = await this.executeWithRetry<QueryResult<T>>(async () => {
      const execResult = await this.bindParams(stmt, params).run<T>();

      return {
        success: true,
        data: execResult.results || [],
        meta: {
          rows_read: execResult.meta?.rows_read || 0,
          rows_written: execResult.meta?.rows_written || 0,
          last_row_id: execResult.meta?.last_row_id,
        },
      };
    }, "prepared");

    return result;
  }

  // ============================================================================
  // Transaction-like Operations
  // ============================================================================

  /**
   * Execute multiple operations with compensation on failure
   * Note: D1 runs each query in an implicit transaction
   */
  async transaction<T>(
    operations: Array<() => Promise<T>>,
    compensation?: Array<(result: T) => Promise<void>>,
  ): Promise<{ success: boolean; results: T[]; error?: string }> {
    const results: T[] = [];

    try {
      for (let i = 0; i < operations.length; i++) {
        const result = await operations[i]();
        results.push(result);
      }

      return { success: true, results };
    } catch (error) {
      // Execute compensation for successful operations
      if (compensation) {
        for (let i = 0; i < results.length && i < compensation.length; i++) {
          try {
            await compensation[i](results[i]);
          } catch (compError) {
            console.error("Compensation failed:", compError);
          }
        }
      }

      return {
        success: false,
        results,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ============================================================================
  // JSON Helpers
  // ============================================================================

  /**
   * Query with JSON field extraction
   */
  async queryWithJson<T>(
    sql: string,
    params: unknown[] = [],
    jsonFields: string[] = [],
  ): Promise<QueryResult<T>> {
    const result = await this.query<Record<string, unknown>>(sql, params);

    if (result.success && result.data && jsonFields.length > 0) {
      const parsedData = result.data.map((row) => {
        const parsed = { ...row } as T;
        for (const field of jsonFields) {
          const value = row[field];
          if (typeof value === "string") {
            try {
              (parsed as Record<string, unknown>)[field] = JSON.parse(value);
            } catch {
              // Keep as string if not valid JSON
            }
          }
        }
        return parsed;
      });

      return {
        ...result,
        data: parsedData,
      };
    }

    return result as QueryResult<T>;
  }

  /**
   * Insert with JSON fields
   */
  async insertWithJson<T extends Record<string, unknown>>(
    table: string,
    data: T,
    jsonFields: (keyof T)[] = [],
  ): Promise<{ success: boolean; lastRowId?: number; error?: string }> {
    const processed: Record<string, unknown> = { ...data };

    for (const field of jsonFields) {
      const key = field as string;
      if (key in processed) {
        processed[key] = JSON.stringify(processed[key]);
      }
    }

    const columns = Object.keys(processed);
    const placeholders = columns.map(() => "?").join(", ");
    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;

    return this.execute(
      sql,
      columns.map((col) => processed[col]),
    );
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private bindParams(
    stmt: D1PreparedStatement,
    params: unknown[],
  ): D1PreparedStatement {
    if (params.length === 0) {
      return stmt;
    }
    return stmt.bind(...params);
  }

  private async executeWithRetry<R>(
    operation: () => Promise<R>,
    queryHint: string,
  ): Promise<R & { error?: string }> {
    let lastError: unknown;
    const maxAttempts = this.config.enableRetries ? this.config.maxRetries : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await operation();
        return result as R & { error?: string };
      } catch (error) {
        lastError = error;

        // Don't retry on SQL errors
        if (
          error instanceof Error &&
          (error.message.includes("syntax error") ||
            error.message.includes("no such table") ||
            error.message.includes("constraint failed"))
        ) {
          break;
        }

        if (attempt < maxAttempts - 1) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          await this.delay(delay);
        }
      }
    }

    const errorMessage =
      lastError instanceof Error ? lastError.message : String(lastError);
    console.error(`D1 query failed after ${maxAttempts} attempts:`, {
      query: queryHint.substring(0, 100),
      error: errorMessage,
    });

    return { error: errorMessage } as R & { error?: string };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a D1 client with default configuration
 */
export function createD1Client(
  db: D1Database,
  config?: D1ClientConfig,
): D1Client {
  return new D1Client(db, config);
}

/**
 * Create a D1 client optimized for reads (uses sessions for replication)
 */
export function createD1ReadClient(
  db: D1Database,
  bookmark?: string,
): D1Client {
  return new D1Client(db, {
    useSessions: true,
    sessionBookmark: bookmark || "first-unconstrained",
    enableRetries: true,
  });
}

/**
 * Create a D1 client optimized for writes
 */
export function createD1WriteClient(db: D1Database): D1Client {
  return new D1Client(db, {
    useSessions: true,
    sessionBookmark: "first-primary", // Forces primary for immediate consistency
    enableRetries: true,
  });
}
