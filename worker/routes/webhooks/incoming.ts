// ============================================================================
// Webhook Routes - Incoming Webhook Handler
// ============================================================================

import type { Env } from "../../types";
import { logger } from "../../lib/global-logger";
import { handleError } from "../../lib/error-handler";
import { handleIncomingWebhook } from "../../lib/webhook-handler";
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
      );
    }

    // Get headers
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
      );
    }

    // Read payload
    const payload = await request.text();

    // Process webhook
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
    );
  }
}
