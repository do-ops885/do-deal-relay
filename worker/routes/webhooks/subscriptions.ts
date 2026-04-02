// ============================================================================
// Webhook Routes - Subscription Management Handlers
// ============================================================================

import type { Env } from "../../types";
import { logger } from "../../lib/global-logger";
import { handleError } from "../../lib/error-handler";
import {
  createSubscription,
  deleteSubscription,
  getPartnerSubscriptions,
  createWebhookPartner,
  getWebhookPartner,
  getDeadLetterQueue,
  retryDeadLetterEvent,
  type WebhookEventType,
} from "../../lib/webhook-handler";
import {
  jsonResponse,
  VALID_WEBHOOK_EVENTS,
  type SubscribeRequest,
  type CreatePartnerRequest,
} from "./types";

// ============================================================================
// API Key Authentication
// ============================================================================

/**
 * Validate API key from request header
 * Expects header: X-API-Key: <api_key>
 * API keys are stored in env.WEBHOOK_API_KEYS as comma-separated list
 */
async function validateApiKey(request: Request, env: Env): Promise<boolean> {
  const apiKey = request.headers.get("X-API-Key");

  if (!apiKey) {
    return false;
  }

  // Get allowed API keys from KV store
  const keysData = await env.WEBHOOK_API_KEYS?.get("api-keys");
  const allowedKeys = keysData ? (JSON.parse(keysData) as string[]) : [];

  // In production, use constant-time comparison to prevent timing attacks
  return allowedKeys.includes(apiKey);
}

/**
 * Middleware to require API key authentication
 */
async function requireAuth(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const isValid = await validateApiKey(request, env);

  if (!isValid) {
    return jsonResponse(
      { error: "Unauthorized. Valid X-API-Key header required." },
      401,
    );
  }

  return null; // Authentication successful
}

export async function handleSubscribe(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    // Check API key authentication
    const authError = await requireAuth(request, env);
    if (authError) return authError;

    const body = (await request.json()) as SubscribeRequest;

    // Validate required fields
    if (!body.url || !body.events || body.events.length === 0) {
      return jsonResponse(
        { error: "Missing required fields: url, events" },
        400,
      );
    }

    // Validate URL
    try {
      new URL(body.url);
    } catch {
      return jsonResponse({ error: "Invalid URL format" }, 400);
    }

    const partnerId = body.partner_id || "default";

    // Validate event types
    const invalidEvents = body.events.filter(
      (e) => !VALID_WEBHOOK_EVENTS.includes(e as WebhookEventType),
    );
    if (invalidEvents.length > 0) {
      return jsonResponse(
        { error: "Invalid event types", invalid: invalidEvents },
        400,
      );
    }

    // Create subscription
    const subscription = await createSubscription(
      env,
      partnerId,
      body.url,
      body.events as WebhookEventType[],
      body.metadata,
      body.retry_policy,
      body.filters,
    );

    logger.info(`Webhook subscription created: ${subscription.id}`, {
      component: "webhook",
      partner_id: partnerId,
      url: body.url,
    });

    return jsonResponse(
      {
        success: true,
        subscription: {
          id: subscription.id,
          url: subscription.url,
          events: subscription.events,
          secret: subscription.secret, // Return once for client to store
          active: subscription.active,
          created_at: subscription.created_at,
        },
      },
      201,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleSubscribe",
    });
    return jsonResponse(
      { error: "Failed to create subscription", message: err.message },
      500,
    );
  }
}

export async function handleUnsubscribe(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    // Check API key authentication
    const authError = await requireAuth(request, env);
    if (authError) return authError;

    const body = (await request.json()) as { subscription_id: string };

    if (!body.subscription_id) {
      return jsonResponse({ error: "Missing subscription_id" }, 400);
    }

    const deleted = await deleteSubscription(env, body.subscription_id);

    if (!deleted) {
      return jsonResponse({ error: "Subscription not found" }, 404);
    }

    logger.info(`Webhook subscription deleted: ${body.subscription_id}`, {
      component: "webhook",
    });

    return jsonResponse({
      success: true,
      message: "Subscription deleted successfully",
    });
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleUnsubscribe",
    });
    return jsonResponse(
      { error: "Failed to delete subscription", message: err.message },
      500,
    );
  }
}

export async function handleListSubscriptions(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const partnerId = url.searchParams.get("partner_id") || "default";

    const subscriptions = await getPartnerSubscriptions(env, partnerId);

    return jsonResponse({
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        url: s.url,
        events: s.events,
        active: s.active,
        created_at: s.created_at,
        filters: s.filters,
      })),
    });
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleListSubscriptions",
    });
    return jsonResponse(
      { error: "Failed to list subscriptions", message: err.message },
      500,
    );
  }
}

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
      return jsonResponse({ error: "Missing required field: name" }, 400);
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
    );
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleCreatePartner",
    });
    return jsonResponse(
      { error: "Failed to create partner", message: err.message },
      500,
    );
  }
}

export async function handleGetPartner(
  env: Env,
  partnerId: string,
): Promise<Response> {
  try {
    const partner = await getWebhookPartner(env, partnerId);

    if (!partner) {
      return jsonResponse({ error: "Partner not found" }, 404);
    }

    return jsonResponse({
      partner: {
        id: partner.id,
        name: partner.name,
        active: partner.active,
        allowed_events: partner.allowed_events,
        rate_limit_per_minute: partner.rate_limit_per_minute,
        created_at: partner.created_at,
      },
    });
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleGetPartner",
    });
    return jsonResponse(
      { error: "Failed to get partner", message: err.message },
      500,
    );
  }
}

// ============================================================================
// Dead Letter Queue
// ============================================================================

export async function handleGetDeadLetterQueue(env: Env): Promise<Response> {
  try {
    const dlq = await getDeadLetterQueue(env);

    return jsonResponse({
      count: dlq.length,
      events: dlq.map((e) => ({
        event_id: e.event.id,
        event_type: e.event.type,
        subscription_id: e.delivery.subscription_id,
        attempts: e.delivery.attempts.length,
        enqueued_at: e.enqueued_at,
        retryable: e.retryable,
      })),
    });
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleGetDeadLetterQueue",
    });
    return jsonResponse(
      { error: "Failed to get DLQ", message: err.message },
      500,
    );
  }
}

export async function handleRetryDeadLetter(
  env: Env,
  eventId: string,
  subscriptionId: string,
): Promise<Response> {
  try {
    const success = await retryDeadLetterEvent(env, eventId, subscriptionId);

    if (!success) {
      return jsonResponse(
        { error: "Event not found or subscription inactive" },
        404,
      );
    }

    return jsonResponse({
      success: true,
      message: "Event queued for retry",
      event_id: eventId,
      subscription_id: subscriptionId,
    });
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleRetryDeadLetter",
    });
    return jsonResponse(
      { error: "Failed to retry event", message: err.message },
      500,
    );
  }
}
