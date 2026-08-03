import type { Env } from "../types";
import { logger } from "../lib/global-logger";
import { jsonResponse, errorResponse } from "./utils";
import { generateUUID } from "../lib/crypto";
import { toErrCtx } from "../lib/errors";
import type { AuthResult } from "../lib/auth";

/**
 * Bookmark a deal for the current user.
 */
export async function handleBookmarkDeal(
  auth: AuthResult,
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    if (!auth.userId) {
      return errorResponse(
        "Authentication required",
        401,
        undefined,
        request,
        env,
      );
    }

    const body = (await request.json()) as { dealId: string };
    if (!body.dealId) {
      return errorResponse("dealId is required", 400, undefined, request, env);
    }

    const now = new Date().toISOString();
    const id = generateUUID();

    const existing = await env.DEALS_DB.prepare(
      `SELECT id FROM deal_bookmarks WHERE user_id = ? AND deal_id = ?`,
    )
      .bind(auth.userId, body.dealId)
      .first();

    if (existing) {
      return jsonResponse(
        { message: "Already bookmarked", bookmarked: true },
        200,
        request,
        env,
      );
    }

    await env.DEALS_DB.prepare(
      `INSERT INTO deal_bookmarks (id, user_id, deal_id, created_at) VALUES (?, ?, ?, ?)`,
    )
      .bind(id, auth.userId, body.dealId, now)
      .run();

    await logAuditAction(auth.userId, "deal_bookmark", "deals", request, env, {
      dealId: body.dealId,
    });

    return jsonResponse(
      { message: "Deal bookmarked", bookmarkId: id },
      201,
      request,
      env,
    );
  } catch (error) {
    logger.error("Failed to bookmark deal", toErrCtx(error));
    return errorResponse("Invalid request", 400, undefined, request, env);
  }
}

/**
 * Remove a bookmark for the current user.
 */
export async function handleRemoveBookmark(
  auth: AuthResult,
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    if (!auth.userId) {
      return errorResponse(
        "Authentication required",
        401,
        undefined,
        request,
        env,
      );
    }

    const body = (await request.json()) as { dealId: string };
    if (!body.dealId) {
      return errorResponse("dealId is required", 400, undefined, request, env);
    }

    await env.DEALS_DB.prepare(
      `DELETE FROM deal_bookmarks WHERE user_id = ? AND deal_id = ?`,
    )
      .bind(auth.userId, body.dealId)
      .run();

    await logAuditAction(
      auth.userId,
      "deal_unbookmark",
      "deals",
      request,
      env,
      {
        dealId: body.dealId,
      },
    );

    return jsonResponse({ message: "Bookmark removed" }, 200, request, env);
  } catch (error) {
    logger.error("Failed to remove bookmark", toErrCtx(error));
    return errorResponse("Invalid request", 400, undefined, request, env);
  }
}

/**
 * List all bookmarked deals for the current user.
 */
export async function handleListBookmarks(
  auth: AuthResult,
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    if (!auth.userId) {
      return errorResponse(
        "Authentication required",
        401,
        undefined,
        request,
        env,
      );
    }

    const result = await env.DEALS_DB.prepare(
      `SELECT id, deal_id, created_at FROM deal_bookmarks
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
    )
      .bind(auth.userId)
      .all();

    const bookmarks = (result.results || []).map((row) => ({
      id: row.id,
      dealId: row.deal_id,
      createdAt: row.created_at,
    }));

    return jsonResponse(
      { bookmarks, count: bookmarks.length },
      200,
      request,
      env,
    );
  } catch (error) {
    logger.error("Failed to list bookmarks", toErrCtx(error));
    return errorResponse(
      "Failed to list bookmarks",
      500,
      undefined,
      request,
      env,
    );
  }
}

async function logAuditAction(
  userId: string | null,
  action: string,
  resource: string,
  request: Request,
  env: Env,
  context: Record<string, unknown> = {},
): Promise<void> {
  try {
    const id = generateUUID();
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const userAgent = request.headers.get("User-Agent") || "unknown";
    const now = new Date().toISOString();
    await env.DEALS_DB.prepare(
      "INSERT INTO audit_log (id, user_id, action, resource, ip_address, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(id, userId, action, resource, ip, userAgent, now)
      .run();
  } catch (err) {
    logger.warn("Auth Audit: logAuditEvent failed", {
      component: "auth",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
