// ============================================================================
// Webhook Routes - Partner Management and Dead Letter Queue Handlers
// ============================================================================

import type { Env } from "../../types";
import { logger } from "../../lib/global-logger";
import { handleError } from "../../lib/error-handler";
import {
  createWebhookPartner,
  getWebhookPartner,
  getDeadLetterQueue,
  retryDeadLetterEvent,
} from "../../lib/webhook/index";
import { jsonResponse, type CreatePartnerRequest } from "./types";
import { requireAuth } from "./subscriptions";

// ============================================================================
// Partner Management
// ============================================================================

export async function handleCreatePartner(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    // Check API key authentication
    const authError = await requireAuth(request, env);
    if (authError) return authError;

    const body = (await request.json()) as CreatePartnerRequest;

    if (!body.name) {
      return jsonResponse(
        { error: "Missing required field: name" },
        400,
        request,
        env,
      );
    }

    const partner = await createWebhookPartner(
      env,
      body.name,
      body.allowed_events,
      body.rate_limit_per_minute,
    );

    logger.info(`Webhook partner created: ${partner.id}`, {
      component: "webhook",
      partner_name: body.name,
    });

    return jsonResponse(
      {
        success: true,
        partner: {
          id: partner.id,
          name: partner.name,
          secret: partner.secret, // Return once for client to store
          active: partner.active,
          allowed_events: partner.allowed_events,
          rate_limit_per_minute: partner.rate_limit_per_minute,
          created_at: partner.created_at,
        },
      },
      201,
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleCreatePartner",
    });
    return jsonResponse(
      { error: "Failed to create partner" },
      500,
      request,
      env,
    );
  }
}

export async function handleGetPartner(
  request: Request,
  env: Env,
  partnerId: string,
): Promise<Response> {
  try {
    // Check API key authentication
    const authError = await requireAuth(request, env);
    if (authError) return authError;

    const partner = await getWebhookPartner(env, partnerId);

    if (!partner) {
      return jsonResponse({ error: "Partner not found" }, 404, request, env);
    }

    return jsonResponse(
      {
        partner: {
          id: partner.id,
          name: partner.name,
          active: partner.active,
          allowed_events: partner.allowed_events,
          rate_limit_per_minute: partner.rate_limit_per_minute,
          created_at: partner.created_at,
        },
      },
      200,
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleGetPartner",
    });
    return jsonResponse({ error: "Failed to get partner" }, 500, request, env);
  }
}

// ============================================================================
// Dead Letter Queue
// ============================================================================

export async function handleGetDeadLetterQueue(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    // Check API key authentication
    const authError = await requireAuth(request, env);
    if (authError) return authError;

    const dlq = await getDeadLetterQueue(env);

    return jsonResponse(
      {
        count: dlq.length,
        events: dlq.map((e) => ({
          event_id: e.event.id,
          event_type: e.event.type,
          subscription_id: e.delivery.subscription_id,
          attempts: e.delivery.attempts.length,
          enqueued_at: e.enqueued_at,
          retryable: e.retryable,
        })),
      },
      200,
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleGetDeadLetterQueue",
    });
    return jsonResponse({ error: "Failed to get DLQ" }, 500, request, env);
  }
}

export async function handleRetryDeadLetter(
  request: Request,
  env: Env,
  eventId: string,
  subscriptionId: string,
): Promise<Response> {
  try {
    // Check API key authentication
    const authError = await requireAuth(request, env);
    if (authError) return authError;

    const success = await retryDeadLetterEvent(env, eventId, subscriptionId);

    if (!success) {
      return jsonResponse(
        { error: "Event not found or subscription inactive" },
        404,
        request,
        env,
      );
    }

    return jsonResponse(
      {
        success: true,
        message: "Event queued for retry",
        event_id: eventId,
        subscription_id: subscriptionId,
      },
      200,
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleRetryDeadLetter",
    });
    return jsonResponse({ error: "Failed to retry event" }, 500, request, env);
  }
}
