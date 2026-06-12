// ============================================================================
// Webhook Routes - Sync Management Handlers
// ============================================================================

import type { Env } from "../../types";
import { handleError } from "../../lib/error-handler";
import {
  createSyncConfig,
  getSyncState,
  saveSyncState,
} from "../../lib/webhook/index";
import { executeSync } from "../../lib/webhook/sync-executor";
import { requireAuth } from "./subscriptions";
import { jsonResponse, type CreateSyncConfigRequest } from "./types";

// ============================================================================
// Sync Management
// ============================================================================

export async function handleCreateSyncConfig(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    // Check API key authentication
    const authError = await requireAuth(request, env);
    if (authError) return authError;

    const body = (await request.json()) as CreateSyncConfigRequest;

    if (!body.partner_id || !body.direction || !body.mode) {
      return jsonResponse(
        { error: "Missing required fields: partner_id, direction, mode" },
        400,
        request,
        env,
      );
    }

    const config = await createSyncConfig(env, {
      partner_id: body.partner_id,
      direction: body.direction,
      mode: body.mode,
      schedule: body.schedule,
      conflict_resolution: body.conflict_resolution || "timestamp",
      priority: body.priority || "local",
      filters: body.filters,
      field_mapping: body.field_mapping,
    });

    return jsonResponse(
      {
        success: true,
        sync_config: {
          id: config.id,
          partner_id: config.partner_id,
          direction: config.direction,
          mode: config.mode,
          status: "idle",
        },
      },
      201,
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleCreateSyncConfig",
    });
    return jsonResponse(
      { error: "Failed to create sync config", message: err.message },
      500,
      request,
      env,
    );
  }
}

export async function handleGetSyncState(
  request: Request,
  env: Env,
  partnerId: string,
): Promise<Response> {
  try {
    const authError = await requireAuth(request, env);
    if (authError) return authError;

    const state = await getSyncState(env, partnerId);

    if (!state) {
      return jsonResponse({ error: "Sync state not found" }, 404, request, env);
    }

    return jsonResponse({ state }, 200, request, env);
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleGetSyncState",
    });
    return jsonResponse(
      { error: "Failed to get sync state", message: err.message },
      500,
      request,
      env,
    );
  }
}

export async function handleTriggerSync(
  request: Request,
  env: Env,
  partnerId: string,
): Promise<Response> {
  try {
    const authError = await requireAuth(request, env);
    if (authError) return authError;

    const state = await getSyncState(env, partnerId);

    if (!state) {
      return jsonResponse(
        { error: "Sync config not found for partner" },
        404,
        request,
        env,
      );
    }

    const config = await getSyncConfig(env, partnerId);
    if (!config) {
      return jsonResponse(
        { error: "Sync config not found" },
        404,
        request,
        env,
      );
    }

    await saveSyncState(env, {
      ...state,
      status: "syncing" as const,
      last_sync_at: new Date().toISOString(),
    });

    const syncResult = await executeSync(env, config, {
      ...state,
      status: "syncing",
      last_sync_at: new Date().toISOString(),
    });

    await saveSyncState(env, {
      ...state,
      status: syncResult.success ? "idle" : "error",
      last_sync_at: new Date().toISOString(),
      cursor: syncResult.cursor || state.cursor,
      pending_changes: syncResult.failed,
      last_error: syncResult.error,
      sync_version: state.sync_version + 1,
    });

    return jsonResponse(
      {
        success: syncResult.success,
        message: `Sync ${syncResult.success ? "completed" : "failed"} for partner ${partnerId}`,
        synced: syncResult.synced,
        failed: syncResult.failed,
        cursor: syncResult.cursor,
      },
      syncResult.success ? 200 : 500,
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleTriggerSync",
    });
    return jsonResponse(
      { error: "Failed to trigger sync", message: err.message },
      500,
      request,
      env,
    );
  }
}

async function getSyncConfig(env: Env, partnerId: string) {
  try {
    const raw = await env.DEALS_LOG.get(
      `webhook:sync_config:${partnerId}`,
      "json",
    );
    return raw as import("../../lib/webhook/types").SyncConfig | null;
  } catch (error) {
    console.warn(
      "Failed to fetch sync config for partner",
      partnerId,
      (error as Error).message,
    );
    return null;
  }
}
