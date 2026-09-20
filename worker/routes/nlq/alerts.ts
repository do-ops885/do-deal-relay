import type { Env } from "../../types";
import { jsonResponse } from "../utils";
import { authenticateRequest } from "../../lib/auth";
import { z } from "zod";
import {
  createAlertSubscription,
  listAlertSubscriptions,
  getAlertSubscription,
  updateAlertSubscription,
  deleteAlertSubscription,
  type AlertChannel,
  type AlertFrequency,
} from "../../lib/d1/alert-subscriptions";

const CreateAlertSchema = z.object({
  saved_query_id: z.string().min(1),
  channel: z.enum(["telegram", "discord", "email", "webhook"]),
  destination: z.string().min(1).max(500),
  threshold: z.number().min(0).max(1).optional().default(0.7),
  frequency: z.enum(["instant", "daily-digest"]).optional().default("instant"),
});

const UpdateAlertSchema = z.object({
  threshold: z.number().min(0).max(1).optional(),
  frequency: z.enum(["instant", "daily-digest"]).optional(),
  active: z.boolean().optional(),
  destination: z.string().min(1).max(500).optional(),
});

async function getUserId(request: Request, env: Env): Promise<string | null> {
  const auth = await authenticateRequest(request, env);
  if (!auth.authenticated || !auth.userId) return null;
  return auth.userId;
}

export async function handleAlertsPost(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.DEALS_DB) {
    return jsonResponse(
      { error: "D1 database not configured", code: "DATABASE_UNAVAILABLE" },
      503,
      request,
      env,
    );
  }
  const userId = await getUserId(request, env);
  if (!userId) {
    return jsonResponse(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      401,
      request,
      env,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { error: "Invalid JSON", code: "PARSE_ERROR" },
      400,
      request,
      env,
    );
  }

  const parsed = CreateAlertSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      {
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: parsed.error.issues,
      },
      400,
      request,
      env,
    );
  }

  try {
    const sub = await createAlertSubscription(env.DEALS_DB, {
      userId,
      savedQueryId: parsed.data.saved_query_id,
      channel: parsed.data.channel as AlertChannel,
      destination: parsed.data.destination,
      threshold: parsed.data.threshold,
      frequency: parsed.data.frequency as AlertFrequency,
    });
    return jsonResponse({ success: true, subscription: sub }, 201, request, env);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("no such table")) {
      return jsonResponse(
        {
          error: "Alert subscriptions not available (migration pending)",
          code: "MIGRATION_PENDING",
        },
        503,
        request,
        env,
      );
    }
    if (msg.includes("Saved query not found")) {
      return jsonResponse(
        { error: msg, code: "SAVED_QUERY_NOT_FOUND" },
        404,
        request,
        env,
      );
    }
    if (msg.includes("Maximum alert limit")) {
      return jsonResponse(
        { error: msg, code: "LIMIT_REACHED" },
        400,
        request,
        env,
      );
    }
    return jsonResponse(
      { error: "Failed to create alert subscription", code: "CREATE_FAILED" },
      500,
      request,
      env,
    );
  }
}

export async function handleAlertsGet(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response> {
  if (!env.DEALS_DB) {
    return jsonResponse(
      { error: "D1 database not configured", code: "DATABASE_UNAVAILABLE" },
      503,
      request,
      env,
    );
  }
  const userId = await getUserId(request, env);
  if (!userId) {
    return jsonResponse(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      401,
      request,
      env,
    );
  }

  const limit = parseInt(url.searchParams.get("limit") || "20", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  try {
    const { rows, total } = await listAlertSubscriptions(
      env.DEALS_DB,
      userId,
      limit,
      offset,
    );
    return jsonResponse(
      { success: true, total, count: rows.length, subscriptions: rows },
      200,
      request,
      env,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("no such table")) {
      return jsonResponse(
        { success: true, total: 0, count: 0, subscriptions: [] },
        200,
        request,
        env,
      );
    }
    return jsonResponse(
      { error: "Failed to list alert subscriptions", code: "LIST_FAILED" },
      500,
      request,
      env,
    );
  }
}

export async function handleAlertsPatch(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  if (!env.DEALS_DB) {
    return jsonResponse(
      { error: "D1 database not configured", code: "DATABASE_UNAVAILABLE" },
      503,
      request,
      env,
    );
  }
  const userId = await getUserId(request, env);
  if (!userId) {
    return jsonResponse(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      401,
      request,
      env,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { error: "Invalid JSON", code: "PARSE_ERROR" },
      400,
      request,
      env,
    );
  }

  const parsed = UpdateAlertSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      {
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: parsed.error.issues,
      },
      400,
      request,
      env,
    );
  }

  try {
    const updated = await updateAlertSubscription(
      env.DEALS_DB,
      userId,
      id,
      parsed.data,
    );
    if (!updated) {
      return jsonResponse(
        { error: "Subscription not found", code: "NOT_FOUND" },
        404,
        request,
        env,
      );
    }
    return jsonResponse({ success: true, subscription: updated }, 200, request, env);
  } catch {
    return jsonResponse(
      { error: "Failed to update subscription", code: "UPDATE_FAILED" },
      500,
      request,
      env,
    );
  }
}

export async function handleAlertsDelete(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  if (!env.DEALS_DB) {
    return jsonResponse(
      { error: "D1 database not configured", code: "DATABASE_UNAVAILABLE" },
      503,
      request,
      env,
    );
  }
  const userId = await getUserId(request, env);
  if (!userId) {
    return jsonResponse(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      401,
      request,
      env,
    );
  }

  const ok = await deleteAlertSubscription(env.DEALS_DB, userId, id);
  if (!ok) {
    return jsonResponse(
      { error: "Not found", code: "NOT_FOUND" },
      404,
      request,
      env,
    );
  }
  return jsonResponse({ success: true, deleted: id }, 200, request, env);
}
