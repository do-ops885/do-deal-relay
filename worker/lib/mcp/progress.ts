/**
 * MCP Progress Notification Support
 *
 * Track long-running operations via D1 database with atomic operations.
 * Provides factories and helpers for progress state management.
 */

import type { Env } from "../../types";
import { logger } from "../global-logger";

const PROGRESS_KV_PREFIX = "mcp:progress:";
const PROGRESS_INDEX_TABLE = "mcp_progress_index";
const PROGRESS_TTL_SECONDS = 3600;

export type ProgressStatus = "running" | "completed" | "failed" | "cancelled";

export interface ProgressState {
  operationId: string;
  status: ProgressStatus;
  progress: number;
  total: number;
  message: string;
  toolName: string;
  createdAt: string;
  updatedAt: string;
  userId?: string | undefined;
  result?: unknown;
  error?: string | undefined;
}

export interface ProgressTracker {
  operationId: string;
  updateProgress: (
    progress: number,
    total: number,
    message: string,
  ) => Promise<void>;
  markCompleted: (result?: unknown) => Promise<void>;
  markFailed: (error: string) => Promise<void>;
  markCancelled: () => Promise<void>;
}

export interface ProgressIndexEntry {
  operationId: string;
  toolName: string;
  createdAt: string;
  userId?: string | undefined;
}

function progressKey(operationId: string): string {
  return `${PROGRESS_KV_PREFIX}${operationId}`;
}

/**
 * Ensures the progress index table exists in D1 database.
 */
async function ensureProgressIndexTable(env: Env): Promise<void> {
  try {
    await env.DEALS_DB.exec(
      `CREATE TABLE IF NOT EXISTS ${PROGRESS_INDEX_TABLE} (operationId TEXT PRIMARY KEY, toolName TEXT NOT NULL, createdAt TEXT NOT NULL, userId TEXT)`,
    );
    try {
      await env.DEALS_DB.exec(
        `ALTER TABLE ${PROGRESS_INDEX_TABLE} ADD COLUMN userId TEXT`,
      );
    } catch {
      // Column userId already exists or table was newly created with it
    }
  } catch (err) {
    logger.warn("MCP Progress: ensureProgressIndexTable failed", {
      component: "mcp-progress",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function addToIndex(
  env: Env,
  operationId: string,
  toolName: string,
  userId?: string,
): Promise<void> {
  try {
    await ensureProgressIndexTable(env);
    const now = new Date().toISOString();
    await env.DEALS_DB.prepare(
      `INSERT OR REPLACE INTO ${PROGRESS_INDEX_TABLE} (operationId, toolName, createdAt, userId) VALUES (?, ?, ?, ?)`,
    )
      .bind(operationId, toolName, now, userId || null)
      .run();
  } catch (err) {
    logger.warn("MCP Progress: addToIndex failed", {
      component: "mcp-progress",
      operationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function removeFromIndex(env: Env, operationId: string): Promise<void> {
  try {
    await ensureProgressIndexTable(env);
    await env.DEALS_DB.prepare(
      `DELETE FROM ${PROGRESS_INDEX_TABLE} WHERE operationId = ?`,
    )
      .bind(operationId)
      .run();
  } catch (err) {
    logger.warn("MCP Progress: removeFromIndex failed", {
      component: "mcp-progress",
      operationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function createProgressTracker(
  operationId: string,
  env: Env,
  userId?: string,
): ProgressTracker {
  const now = new Date().toISOString();
  const writeState = async (state: Partial<ProgressState>): Promise<void> => {
    const existing = await getProgress(operationId, env);
    const defaults: ProgressState = {
      operationId,
      status: "running",
      progress: 0,
      total: 1,
      message: "",
      toolName: "",
      createdAt: now,
      updatedAt: now,
      userId,
    };
    const merged: ProgressState = Object.assign(
      {},
      defaults,
      existing || {},
      state,
      { updatedAt: new Date().toISOString() },
    );
    if (userId && !merged.userId) {
      merged.userId = userId;
    }
    await env.DEALS_PROD.put(progressKey(operationId), JSON.stringify(merged), {
      expirationTtl: PROGRESS_TTL_SECONDS,
    });
  };
  return {
    operationId,
    updateProgress: async (
      progress: number,
      total: number,
      message: string,
    ) => {
      await writeState({ progress, total, message, status: "running" });
    },
    markCompleted: async (result?: unknown) => {
      await writeState({
        status: "completed",
        progress: 1,
        total: 1,
        message: "Operation completed",
        result,
      });
      await removeFromIndex(env, operationId);
    },
    markFailed: async (error: string) => {
      await writeState({
        status: "failed",
        error,
        message: `Failed: ${error}`,
      });
      await removeFromIndex(env, operationId);
    },
    markCancelled: async () => {
      await writeState({
        status: "cancelled",
        message: "Operation cancelled by user",
      });
      await removeFromIndex(env, operationId);
    },
  };
}

export async function updateProgress(
  tracker: ProgressTracker,
  progress: number,
  total: number,
  message: string,
): Promise<void> {
  await tracker.updateProgress(progress, total, message);
}

export async function getProgress(
  operationId: string,
  env: Env,
): Promise<ProgressState | null> {
  try {
    const raw = await env.DEALS_PROD.get(progressKey(operationId));
    if (!raw) return null;
    return JSON.parse(raw) as ProgressState;
  } catch (err) {
    logger.warn("MCP Progress: getProgress failed", {
      component: "mcp-progress",
      operationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function listOperations(
  env: Env,
  userId?: string,
  isAdmin?: boolean,
): Promise<ProgressIndexEntry[]> {
  try {
    await ensureProgressIndexTable(env);
    if (isAdmin) {
      const result = await env.DEALS_DB.prepare(
        `SELECT operationId, toolName, createdAt, userId FROM ${PROGRESS_INDEX_TABLE} WHERE createdAt > datetime('now', '-' || ? || ' seconds') LIMIT 200`,
      )
        .bind(PROGRESS_TTL_SECONDS.toString())
        .all<ProgressIndexEntry>();
      return result.results;
    }

    if (userId) {
      const result = await env.DEALS_DB.prepare(
        `SELECT operationId, toolName, createdAt, userId FROM ${PROGRESS_INDEX_TABLE} WHERE userId = ? AND createdAt > datetime('now', '-' || ? || ' seconds') LIMIT 200`,
      )
        .bind(userId, PROGRESS_TTL_SECONDS.toString())
        .all<ProgressIndexEntry>();
      return result.results;
    }

    return [];
  } catch (err) {
    logger.warn("MCP Progress: listOperations failed", {
      component: "mcp-progress",
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
