// ============================================================================
// Webhook System - Routes for Incoming/Outgoing Webhooks
// ============================================================================

import type { Env } from "../types";
import { logger } from "../lib/global-logger";
import { handleError } from "../lib/error-handler";
import {
  handleIncomingWebhook,
  createSubscription,
  deleteSubscription,
  getSubscription,
  getPartnerSubscriptions,
  createWebhookPartner,
  getWebhookPartner,
  getDeadLetterQueue,
  retryDeadLetterEvent,
  createSyncConfig,
  getSyncState,
  type WebhookEventType,
  type RetryPolicy,
  type WebhookFilters,
} from "../lib/webhook-handler";

// ============================================================================
// Route Handler
// ============================================================================

export async function handleWebhookRoutes(
  request: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  // Incoming webhooks (public, signature verified)
  if (path.startsWith("/webhooks/incoming/") && request.method === "POST") {
    const partnerId = path.replace("/webhooks/incoming/", "").split("/")[0];
    return handleIncomingWebhookRequest(request, env, partnerId);
  }

  // Subscription management (requires API key auth)
  if (path === "/webhooks/subscribe" && request.method === "POST") {
    return handleSubscribe(request, env);
  }

  if (path === "/webhooks/unsubscribe" && request.method === "POST") {
    return handleUnsubscribe(request, env);
  }

  if (path === "/webhooks/subscriptions" && request.method === "GET") {
    return handleListSubscriptions(request, env);
  }

  // Partner management (admin only)
  if (path === "/webhooks/partners" && request.method === "POST") {
    return handleCreatePartner(request, env);
  }

  if (path.startsWith("/webhooks/partners/") && request.method === "GET") {
    const partnerId = path.replace("/webhooks/partners/", "").split("/")[0];
    return handleGetPartner(env, partnerId);
  }

  // Dead letter queue management
  if (path === "/webhooks/dlq" && request.method === "GET") {
    return handleGetDeadLetterQueue(env);
  }

  if (path.startsWith("/webhooks/dlq/") && request.method === "POST") {
    const parts = path.replace("/webhooks/dlq/", "").split("/");
    const eventId = parts[0];
    const subscriptionId = parts[1];
    return handleRetryDeadLetter(env, eventId, subscriptionId);
  }

  // Bidirectional sync
  if (path === "/webhooks/sync" && request.method === "POST") {
    return handleCreateSyncConfig(request, env);
  }

  if (path.startsWith("/webhooks/sync/") && request.method === "GET") {
    const partnerId = path.replace("/webhooks/sync/", "").split("/")[0];
    return handleGetSyncState(env, partnerId);
  }

  // Not a webhook route
  return null;
}

// ============================================================================
// Incoming Webhook Handler
// ============================================================================

async function handleIncomingWebhookRequest(
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

// ============================================================================
// Subscription Management
// ============================================================================

async function handleSubscribe(request: Request, env: Env): Promise<Response> {
  try {
    // TODO: Add API key authentication
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
    const validEvents: WebhookEventType[] = [
      "referral.created",
      "referral.updated",
      "referral.deactivated",
      "referral.expired",
      "referral.validated",
      "referral.quarantined",
      "ping",
    ];

    const invalidEvents = body.events.filter(
      (e) => !validEvents.includes(e as WebhookEventType),
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

interface SubscribeRequest {
  url: string;
  events: string[];
  partner_id?: string;
  metadata?: Record<string, unknown>;
  retry_policy?: Partial<RetryPolicy>;
  filters?: WebhookFilters;
}

async function handleUnsubscribe(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
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

async function handleListSubscriptions(
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

async function handleCreatePartner(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      name: string;
      allowed_events?: WebhookEventType[];
      rate_limit_per_minute?: number;
    };

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

async function handleGetPartner(
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

async function handleGetDeadLetterQueue(env: Env): Promise<Response> {
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

async function handleRetryDeadLetter(
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

// ============================================================================
// Sync Management
// ============================================================================

async function handleCreateSyncConfig(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      partner_id: string;
      direction: "push" | "pull" | "bidirectional";
      mode: "realtime" | "scheduled" | "manual";
      schedule?: { cron: string; timezone: string };
      conflict_resolution?: "timestamp" | "priority" | "manual";
      priority?: "local" | "remote";
      filters?: WebhookFilters;
      field_mapping?: Record<string, string>;
    };

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

async function handleGetSyncState(
  env: Env,
  partnerId: string,
): Promise<Response> {
  try {
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

// ============================================================================
// Utilities
// ============================================================================

function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, Idempotency-Key",
    },
  });
}
