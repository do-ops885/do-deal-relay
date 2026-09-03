// ============================================================================
// Webhook Routes - Subscription Management Handlers
// ============================================================================

import type { Env } from "../../types";
import { logger } from "../../lib/global-logger";
import { handleError } from "../../lib/error-handler";
import {
  createSubscription,
  deleteSubscription,
  getUserSubscriptions,
  getSubscription,
  type WebhookEventType,
} from "../../lib/webhook/index";
import {
  jsonResponse,
  VALID_WEBHOOK_EVENTS,
  type SubscribeRequest,
} from "./types";
import { requireAuth as unifiedRequireAuth } from "../../lib/auth";
import { validateFetchUrl } from "../../lib/security";

// ============================================================================
// API Key Authentication
// ============================================================================

/**
 * Middleware to require API key authentication
 */
export async function requireAuth(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const authMiddleware = unifiedRequireAuth(env);
  const result = await authMiddleware(request);

  if (result instanceof Response) {
    return result;
  }

  return null; // Authentication successful
}

export async function requireAuthenticatedUser(
  request: Request,
  env: Env,
  userId?: string,
): Promise<string | Response> {
  if (userId) return userId;
  const authMiddleware = unifiedRequireAuth(env);
  const auth = await authMiddleware(request);
  if (auth instanceof Response) return auth;
  if (!auth.userId) {
    return jsonResponse(
      { error: "A user-bound credential is required for this operation" },
      403,
      request,
      env,
    );
  }
  return auth.userId;
}

export async function handleSubscribe(
  request: Request,
  env: Env,
  authenticatedUserId?: string,
): Promise<Response> {
  try {
    const ownerId = await requireAuthenticatedUser(
      request,
      env,
      authenticatedUserId,
    );
    if (ownerId instanceof Response) return ownerId;

    const body = (await request.json()) as SubscribeRequest;

    // Validate required fields
    if (!body.url || !body.events || body.events.length === 0) {
      return jsonResponse(
        { error: "Missing required fields: url, events" },
        400,
        request,
        env,
      );
    }

    // Validate URL
    try {
      new URL(body.url);
    } catch {
      return jsonResponse({ error: "Invalid URL format" }, 400, request, env);
    }

    // SSRF Protection: Ensure the URL is public and uses a safe protocol
    const isSafe = await validateFetchUrl(body.url);
    if (!isSafe) {
      return jsonResponse(
        { error: "Disallowed URL: Subscription blocked by SSRF protection" },
        400,
        request,
        env,
      );
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
        request,
        env,
      );
    }

    // Create subscription
    const subscription = await createSubscription(
      env,
      partnerId,
      body.url,
      body.events as WebhookEventType[],
      ownerId,
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
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleSubscribe",
    });
    return jsonResponse(
      { error: "Failed to create subscription" },
      500,
      request,
      env,
    );
  }
}

export async function handleUnsubscribe(
  request: Request,
  env: Env,
  authenticatedUserId?: string,
  allowAdmin = false,
): Promise<Response> {
  try {
    const ownerId = await requireAuthenticatedUser(
      request,
      env,
      authenticatedUserId,
    );
    if (ownerId instanceof Response) return ownerId;

    const body = (await request.json()) as { subscription_id: string };

    if (!body.subscription_id) {
      return jsonResponse(
        { error: "Missing subscription_id" },
        400,
        request,
        env,
      );
    }

    const subscription = await getSubscription(env, body.subscription_id);
    if (
      !subscription ||
      !isManagedByOwner(subscription.owner_id, ownerId, allowAdmin)
    ) {
      return jsonResponse(
        { error: "Subscription not found" },
        404,
        request,
        env,
      );
    }

    const deleted = await deleteSubscription(env, subscription.id);

    if (!deleted) {
      return jsonResponse(
        { error: "Subscription not found" },
        404,
        request,
        env,
      );
    }

    logger.info(`Webhook subscription deleted: ${body.subscription_id}`, {
      component: "webhook",
    });

    return jsonResponse(
      {
        success: true,
        message: "Subscription deleted successfully",
      },
      200,
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleUnsubscribe",
    });
    return jsonResponse(
      { error: "Failed to delete subscription" },
      500,
      request,
      env,
    );
  }
}

export async function handleUnsubscribeById(
  request: Request,
  subscriptionId: string,
  env: Env,
  authenticatedUserId?: string,
  allowAdmin = false,
): Promise<Response> {
  try {
    const ownerId = await requireAuthenticatedUser(
      request,
      env,
      authenticatedUserId,
    );
    if (ownerId instanceof Response) return ownerId;
    const subscription = await getSubscription(env, subscriptionId);
    if (
      !subscription ||
      !isManagedByOwner(subscription.owner_id, ownerId, allowAdmin)
    ) {
      return jsonResponse(
        { error: "Subscription not found" },
        404,
        request,
        env,
      );
    }
    const deleted = await deleteSubscription(env, subscription.id);

    if (!deleted) {
      return jsonResponse(
        { error: "Subscription not found" },
        404,
        request,
        env,
      );
    }

    logger.info(`Webhook subscription deleted: ${subscriptionId}`, {
      component: "webhook",
    });

    return jsonResponse(
      {
        success: true,
        message: "Subscription deleted successfully",
      },
      200,
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleUnsubscribeById",
    });
    return jsonResponse(
      { error: "Failed to delete subscription" },
      500,
      request,
      env,
    );
  }
}

export async function handleListSubscriptions(
  request: Request,
  env: Env,
  authenticatedUserId?: string,
  allowAdmin = false,
): Promise<Response> {
  try {
    const ownerId = await requireAuthenticatedUser(
      request,
      env,
      authenticatedUserId,
    );
    if (ownerId instanceof Response) return ownerId;

    const url = new URL(request.url);
    const partnerId = url.searchParams.get("partner_id") || "default";

    const subscriptions = await getUserSubscriptions(
      env,
      ownerId,
      partnerId,
      allowAdmin,
    );

    return jsonResponse(
      {
        subscriptions: subscriptions.map((s) => ({
          id: s.id,
          url: s.url,
          events: s.events,
          active: s.active,
          created_at: s.created_at,
          filters: s.filters,
        })),
      },
      200,
      request,
      env,
    );
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleListSubscriptions",
    });
    return jsonResponse(
      { error: "Failed to list subscriptions" },
      500,
      request,
      env,
    );
  }
}

function isManagedByOwner(
  recordOwnerId: unknown,
  ownerId: string,
  allowAdmin: boolean,
): boolean {
  return recordOwnerId === ownerId || allowAdmin;
}
