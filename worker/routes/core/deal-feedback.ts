import type { Env } from "../../types";
import type { AuthResult } from "../../lib/auth";
import { z } from "zod";
import { jsonResponse, errorResponse } from "../utils";
import {
  checkRateLimit,
  getClientIdentifier,
  createRateLimitHeaders,
} from "../../lib/rate-limit";
import { getDealsByCode } from "../../lib/storage";
import {
  getDealFeedbackStats,
  recordDealFeedback,
} from "../../lib/d1/deal-feedback";
import { createComplianceLogger } from "../../lib/eu-ai-act-logger";
import { logger } from "../../lib/global-logger";

const FEEDBACK_BODY_SCHEMA = z.object({
  outcome: z.enum(["success", "expired", "invalid"]),
  comment: z.string().max(500).optional(),
  source_channel: z.string().max(32).optional(),
});

const MAX_FEEDBACK_COMMENT_LENGTH = 500;

/**
 * HTTP route handler for recording user-reported deal feedback
 * (ADR-033 slice 1). JWT `user` role required (enforced by the router's
 * withAuth wrapper); body validated with Zod; unknown codes 404.
 */
export async function handleDealFeedback(
  request: Request,
  code: string,
  env: Env,
  auth: AuthResult,
): Promise<Response> {
  const clientId = await getClientIdentifier(request, auth);
  const rateLimitResult = await checkRateLimit(
    env,
    clientId,
    "/api/deals/feedback",
  );
  if (!rateLimitResult.allowed) {
    const headers = createRateLimitHeaders(rateLimitResult);
    headers.set("Content-Type", "application/json");
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded",
        retry_after: Math.ceil(rateLimitResult.resetTime - Date.now() / 1000),
      }),
      { status: 429, headers },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid request body", 400, undefined, request, env);
  }

  const parsed = FEEDBACK_BODY_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "Invalid feedback body: outcome must be one of success, expired, invalid; comment max " +
        MAX_FEEDBACK_COMMENT_LENGTH +
        " chars",
      400,
      undefined,
      request,
      env,
    );
  }

  if (!auth.userId) {
    return errorResponse("Unauthorized", 401, undefined, request, env);
  }

  try {
    const deals = await getDealsByCode(env, code);
    if (deals.length === 0) {
      return errorResponse("Deal not found", 404, undefined, request, env);
    }

    const inserted = await recordDealFeedback(env.DEALS_DB, {
      userId: auth.userId,
      referralCode: code,
      outcome: parsed.data.outcome,
      sourceChannel: parsed.data.source_channel || "api",
      ...(parsed.data.comment !== undefined
        ? { comment: parsed.data.comment }
        : {}),
    });

    const stats = await getDealFeedbackStats(env.DEALS_DB, code);

    // EU AI Act Article 12: feedback outcomes later influence AI-assisted
    // ranking (slice 3), so the record operation is logged at capture time.
    try {
      const complianceLogger = createComplianceLogger(env.DEALS_DB);
      await complianceLogger.logOperation({
        timestamp: new Date().toISOString(),
        operationId: `deal_feedback_${auth.userId}_${code}_${Date.now()}`,
        operation: "deal_feedback_recorded",
        inputData: {
          source: "user_report",
          hash: code,
          description: `User reported outcome "${parsed.data.outcome}" for code ${code}`,
          metadata: {
            userId: auth.userId,
            channel: parsed.data.source_channel || "api",
          },
        },
        outputData: {
          result: inserted ? "recorded" : "updated",
          confidence: 1.0,
          explanation: `Feedback ${inserted ? "recorded" : "revised"} for ${code}`,
        },
      });
    } catch (logErr) {
      logger.warn("EU AI Act logging failed for deal feedback (non-critical)", {
        component: "deal-feedback-api",
        error: logErr instanceof Error ? logErr.message : String(logErr),
      });
    }

    return jsonResponse(
      {
        code,
        outcome: parsed.data.outcome,
        inserted,
        feedback: stats,
      },
      201,
      request,
      env,
    );
  } catch (error) {
    logger.error("Failed to record deal feedback", {
      component: "deal-feedback-api",
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(
      "Failed to record feedback",
      500,
      undefined,
      request,
      env,
    );
  }
}
