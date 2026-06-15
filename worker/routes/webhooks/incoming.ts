// ============================================================================
// Webhook Routes - Incoming Webhook Handler
// ============================================================================

import type { Env } from "../../types";
import { logger } from "../../lib/global-logger";
import { handleError } from "../../lib/error-handler";
import {
  handleIncomingWebhook,
  getWebhookPartner,
} from "../../lib/webhook/index";
import { verifyHmacSignature } from "../../lib/hmac";
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

    // Read payload for signature verification
    const payload = await request.text();

    // Extract and validate required headers
    const signature = request.headers.get("x-webhook-signature") || "";
    const timestamp = request.headers.get("x-webhook-timestamp") || "";
    const webhookId = request.headers.get("x-webhook-id") || "";
    const idempotencyKey = request.headers.get("idempotency-key") || undefined;

    if (!signature || !timestamp || !webhookId) {
      return jsonResponse(
        {
          error: "Missing required headers",
          required: [
            "X-Webhook-Signature",
            "X-Webhook-Timestamp",
            "X-Webhook-Id",
          ],
        },
        400,
        request,
        env,
      );
    }

    // Verify HMAC signature at request boundary (defense-in-depth)
    const verification = await verifyHmacSignature(
      payload,
      signature.replace("sha256=", ""),
      partner.secret,
      parseInt(timestamp, 10),
    );
    if (!verification.valid) {
      logger.warn("Webhook signature verification failed", {
        component: "webhook",
        partner_id: partnerId,
        error: verification.error,
      });
      return jsonResponse(
        { error: "Invalid webhook signature" },
        401,
        request,
        env,
      );
    }

    // Process webhook through the library handler
    const result = await handleIncomingWebhook(env, partnerId, payload, {
      signature,
      timestamp,
      webhookId,
      idempotencyKey,
    });

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
      { error: "Failed to process webhook" },
      500,
      request,
      env,
    );
  }
}
