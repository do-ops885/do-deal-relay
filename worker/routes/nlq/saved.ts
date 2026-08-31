import type { Env } from "../../types";
import { jsonResponse } from "../utils";
import { authenticateRequest } from "../../lib/auth";
import { parseQuery } from "../../lib/nlq/parser";
import { z } from "zod";
import {
  saveQuery,
  listSavedQueries,
  deleteSavedQuery,
} from "../../lib/d1/nlq-saved";

const SaveBodySchema = z.object({
  query: z.string().min(1).max(500),
  name: z.string().min(1).max(100).optional(),
});

async function getUserId(request: Request, env: Env): Promise<string | null> {
  const auth = await authenticateRequest(request, env);
  if (!auth.authenticated || !auth.userId) return null;
  return auth.userId;
}

export async function handleSavedPost(
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
  if (!userId)
    return jsonResponse(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      401,
      request,
      env,
    );

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
  const parsed = SaveBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      {
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: parsed.error.errors,
      },
      400,
      request,
      env,
    );
  }

  const intent = parseQuery(parsed.data.query).intent.intent;
  try {
    const row = await saveQuery(env.DEALS_DB, {
      userId,
      query: parsed.data.query,
      name: parsed.data.name,
      intent,
    });
    return jsonResponse({ success: true, saved: row }, 201, request, env);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Table missing (migration not run) -> return 503 with hint
    if (msg.includes("no such table")) {
      return jsonResponse(
        {
          error: "Saved queries not available (migration pending)",
          code: "MIGRATION_PENDING",
        },
        503,
        request,
        env,
      );
    }
    return jsonResponse(
      { error: "Failed to save query", code: "SAVE_FAILED" },
      500,
      request,
      env,
    );
  }
}

export async function handleSavedGet(
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
  if (!userId)
    return jsonResponse(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      401,
      request,
      env,
    );

  const limit = parseInt(url.searchParams.get("limit") || "20", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  try {
    const { rows, total } = await listSavedQueries(
      env.DEALS_DB,
      userId,
      limit,
      offset,
    );
    return jsonResponse(
      { success: true, total, count: rows.length, saved: rows },
      200,
      request,
      env,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("no such table")) {
      return jsonResponse(
        { success: true, total: 0, count: 0, saved: [] },
        200,
        request,
        env,
      );
    }
    return jsonResponse(
      { error: "Failed to list saved queries", code: "LIST_FAILED" },
      500,
      request,
      env,
    );
  }
}

export async function handleSavedDelete(
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
  if (!userId)
    return jsonResponse(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      401,
      request,
      env,
    );

  const ok = await deleteSavedQuery(env.DEALS_DB, userId, id);
  if (!ok)
    return jsonResponse(
      { error: "Not found", code: "NOT_FOUND" },
      404,
      request,
      env,
    );
  return jsonResponse({ success: true, deleted: id }, 200, request, env);
}
