// ============================================================================
// Webhook Routes - Sync Management Handlers
// ============================================================================

import type { Env } from "../../types";
import { handleError } from "../../lib/error-handler";
import { createSyncConfig, getSyncState } from "../../lib/webhook/index";
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
    );
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleCreateSyncConfig",
    });
    return jsonResponse(
      { error: "Failed to create sync config", message: err.message },
      500,
    );
  }
}

export async function handleGetSyncState(
  request: Request,
  env: Env,
  partnerId: string,
): Promise<Response> {
  try {
    // Check API key authentication
    const authError = await requireAuth(request, env);
    if (authError) return authError;

    const state = await getSyncState(env, partnerId);

    if (!state) {
      return jsonResponse({ error: "Sync state not found" }, 404);
    }

    return jsonResponse({ state });
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleGetSyncState",
    });
    return jsonResponse(
      { error: "Failed to get sync state", message: err.message },
      500,
    );
  }
}
