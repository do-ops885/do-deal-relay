/**
 * MCP Progress Notification Support
 *
 * Track long-running operations via KV with 1-hour TTL.
 * Provides factories and helpers for progress state management.
 */

import type { Env } from "../../types";

const PROGRESS_KV_PREFIX = "mcp:progress:";
const PROGRESS_INDEX_KEY = "mcp:progress:index";
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

async function updateIndex(env: Env, entry: ProgressIndexEntry): Promise<void> {
  try {
    const raw = await env.DEALS_PROD.get(PROGRESS_INDEX_KEY);
    const index: ProgressIndexEntry[] = raw ? JSON.parse(raw) : [];
    index.push(entry);
    const staleCutoff = Date.now() - PROGRESS_TTL_SECONDS * 1000;
    const filtered = index.filter(
      (e) => new Date(e.createdAt).getTime() > staleCutoff,
    );
    if (filtered.length > 200) {
      filtered.splice(0, filtered.length - 200);
    }
    await env.DEALS_PROD.put(PROGRESS_INDEX_KEY, JSON.stringify(filtered), {
      expirationTtl: PROGRESS_TTL_SECONDS,
    });
  } catch {
    // Index best-effort; failure should not block progress tracking
  }
}

async function removeFromIndex(env: Env, operationId: string): Promise<void> {
  try {
    const raw = await env.DEALS_PROD.get(PROGRESS_INDEX_KEY);
    if (!raw) return;
    const index: ProgressIndexEntry[] = JSON.parse(raw);
    const filtered = index.filter((e) => e.operationId !== operationId);
    await env.DEALS_PROD.put(PROGRESS_INDEX_KEY, JSON.stringify(filtered), {
      expirationTtl: PROGRESS_TTL_SECONDS,
    });
  } catch {
    // Best-effort
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
  } catch {
    return null;
  }
}

export async function listOperations(env: Env): Promise<ProgressIndexEntry[]> {
  try {
    const raw = await env.DEALS_PROD.get(PROGRESS_INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ProgressIndexEntry[];
  } catch {
    return [];
  }
}
