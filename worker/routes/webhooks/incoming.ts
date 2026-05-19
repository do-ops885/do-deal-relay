// ============================================================================
// Webhook Routes - Incoming Webhook Handler
// ============================================================================

import type { Env } from "../../types";
import { logger } from "../../lib/global-logger";
import { handleError } from "../../lib/error-handler";
import { handleIncomingWebhook } from "../../lib/webhook/index";
import { verifyWebhookSignature } from "../../lib/hmac";
import { getWebhookPartner } from "../../lib/webhook/subscriptions";
import { jsonResponse } from "./types";

// ============================================================================
// Incoming Webhook Handler
// ============================================================================

export async function handleIncomingWebhookRequest(
  request: Request,
  env: Env,
  partnerId: string,
): Promise<Response> {
  try {
    // Validate content type
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return jsonResponse(
        { error: "Content-Type must be application/json" },
        415,
        request,
        env,
      );
    }

    // Look up partner for secret (needed for HMAC verification)
    const partner = await getWebhookPartner(env, partnerId);
    if (!partner) {
      return jsonResponse({ error: "Unknown partner" }, 401, request, env);
    }
    if (!partner.active) {
      return jsonResponse({ error: "Partner deactivated" }, 403, request, env);
    }

    // Verify webhook signature at request boundary (defense-in-depth)
    const verification = await verifyWebhookSignature(request, partner.secret);
    if (!verification.valid) {
      logger.warn("Webhook signature verification failed", {
        component: "webhook",
        partner_id: partnerId,
        error: verification.error,
      });
      return jsonResponse(
        { error: `Invalid webhook signature: ${verification.error}` },
        401,
        request,
        env,
      );
    }

    // Validate webhook ID header (verifyWebhookSignature already checked signature + timestamp)
    const webhookId = request.headers.get("x-webhook-id");
    if (!webhookId) {
      return jsonResponse(
        { error: "Missing required headers", required: ["X-Webhook-Id"] },
        401,
        request,
        env,
      );
    }

    // Get remaining headers for downstream processing
    const signature = request.headers.get("x-webhook-signature") || "";
    const timestamp = request.headers.get("x-webhook-timestamp") || "";
    const idempotencyKey = request.headers.get("idempotency-key") || undefined;

    // Read payload
    const payload = await request.text();

    // Process webhook (HMAC already verified at route level)
    const result = await handleIncomingWebhook(
      env,
      partnerId,
      payload,
      {
        signature,
        timestamp,
        webhookId,
        idempotencyKey,
      },
      true,
    );

    return jsonResponse(
      {
        success: result.success,
        message: result.message,
        referral_id: result.referralId,
        error: result.error,
      },
      result.statusCode,
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleIncomingWebhookRequest",
      partner_id: partnerId,
    });
    return jsonResponse(
      { error: "Failed to process webhook", message: err.message },
      500,
      request,
      env,
    );
  }
}
