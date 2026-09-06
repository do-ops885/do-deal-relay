/**
 * D1 Client JSON Helpers
 * JSON field parsing/serialization helpers extracted from client.ts.
 * The D1Client class delegates to these; the public client API is unchanged.
 */

import type { QueryResult } from "./client-types";

/**
 * Minimal structural surface of D1Client consumed by the JSON helpers.
 * Kept local to avoid a circular runtime dependency on client.ts.
 */
export interface JsonCapableClient {
  query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  execute(
    sql: string,
    params?: unknown[],
  ): Promise<{ success: boolean; lastRowId?: number; error?: string }>;
}

/**
 * Query with JSON field extraction
 */
export async function queryWithJsonFields<T>(
  client: JsonCapableClient,
  sql: string,
  params: unknown[] = [],
  jsonFields: string[] = [],
): Promise<QueryResult<T>> {
  const result = await client.query<Record<string, unknown>>(sql, params);

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
export async function insertWithJsonFields<T extends Record<string, unknown>>(
  client: JsonCapableClient,
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

  return client.execute(
    sql,
    columns.map((col) => processed[col]),
  );
}
