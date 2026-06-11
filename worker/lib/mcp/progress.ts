/**
 * MCP Progress Notification Support
 *
 * Track long-running operations via D1 database with atomic operations.
 * Provides factories and helpers for progress state management.
 */

import type { Env } from "../../types";

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
  result?: unknown;
  error?: string;
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
      `CREATE TABLE IF NOT EXISTS ${PROGRESS_INDEX_TABLE} (operationId TEXT PRIMARY KEY, toolName TEXT NOT NULL, createdAt TEXT NOT NULL)`,
    );
  } catch (err) {
    console.warn("MCP Progress: ensureProgressIndexTable failed", err);
  }
}

async function updateIndex(env: Env, entry: ProgressIndexEntry): Promise<void> {
  try {
    await ensureProgressIndexTable(env);
    await env.DEALS_DB.prepare(
      `
      INSERT INTO ${PROGRESS_INDEX_TABLE} (operationId, toolName, createdAt)
      VALUES (?, ?, ?)
      ON CONFLICT(operationId) DO NOTHING
    `,
    )
      .bind(entry.operationId, entry.toolName, entry.createdAt)
      .run();
  } catch (err) {
    console.warn("MCP Progress: updateIndex failed", entry.operationId, err);
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
    console.warn("MCP Progress: removeFromIndex failed", operationId, err);
  }
}

async function cleanupStaleIndex(env: Env): Promise<void> {
  try {
    await env.DEALS_DB.prepare(
      `DELETE FROM ${PROGRESS_INDEX_TABLE} WHERE createdAt < datetime('now', '-' || ? || ' seconds')`,
    )
      .bind(PROGRESS_TTL_SECONDS.toString())
      .run();
  } catch (err) {
    console.warn("MCP Progress: cleanupStaleIndex failed", err);
  }
}

export function createProgressTracker(
  operationId: string,
  env: Env,
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
    };
    const merged: ProgressState = Object.assign(
      {},
      defaults,
      existing || {},
      state,
      { updatedAt: new Date().toISOString() },
    );
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
    console.warn("MCP Progress: getProgress failed", operationId, err);
    return null;
  }
}

export async function listOperations(env: Env): Promise<ProgressIndexEntry[]> {
  try {
    await ensureProgressIndexTable(env);
    const result = await env.DEALS_DB.prepare(
      `SELECT operationId, toolName, createdAt FROM ${PROGRESS_INDEX_TABLE} WHERE createdAt > datetime('now', '-' || ? || ' seconds') LIMIT 200`,
    )
      .bind(PROGRESS_TTL_SECONDS.toString())
      .all<ProgressIndexEntry>();
    return result.results;
  } catch (err) {
    console.warn("MCP Progress: listOperations failed", err);
    return [];
  }
}
