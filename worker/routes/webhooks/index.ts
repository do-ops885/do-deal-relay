// ============================================================================
// Webhook System - Routes for Incoming/Outgoing Webhooks
// ============================================================================

import type { Env } from "../../types";
import { handleIncomingWebhookRequest } from "./incoming";
import {
  handleSubscribe,
  handleUnsubscribe,
  handleListSubscriptions,
  handleCreatePartner,
  handleGetPartner,
  handleGetDeadLetterQueue,
  handleRetryDeadLetter,
} from "./subscriptions";
import { handleCreateSyncConfig, handleGetSyncState } from "./sync";

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
    return handleGetPartner(request, env, partnerId);
  }

  // Dead letter queue management
  if (path === "/webhooks/dlq" && request.method === "GET") {
    return handleGetDeadLetterQueue(request, env);
  }

  if (path.startsWith("/webhooks/dlq/") && request.method === "POST") {
    const parts = path.replace("/webhooks/dlq/", "").split("/");
    const eventId = parts[0];
    const subscriptionId = parts[1];
    return handleRetryDeadLetter(request, env, eventId, subscriptionId);
  }

  // Bidirectional sync
  if (path === "/webhooks/sync" && request.method === "POST") {
    return handleCreateSyncConfig(request, env);
  }

  if (path.startsWith("/webhooks/sync/") && request.method === "GET") {
    const partnerId = path.replace("/webhooks/sync/", "").split("/")[0];
    return handleGetSyncState(request, env, partnerId);
  }

  // Not a webhook route
  return null;
}

// Re-export all handlers for external use
export { handleIncomingWebhookRequest } from "./incoming";
export {
  handleSubscribe,
  handleUnsubscribe,
  handleListSubscriptions,
  handleCreatePartner,
  handleGetPartner,
  handleGetDeadLetterQueue,
  handleRetryDeadLetter,
} from "./subscriptions";
export { handleCreateSyncConfig, handleGetSyncState } from "./sync";
export {
  jsonResponse,
  type SubscribeRequest,
  type CreatePartnerRequest,
  type CreateSyncConfigRequest,
  type UnsubscribeRequest,
  VALID_WEBHOOK_EVENTS,
  type WebhookEventType,
  type RetryPolicy,
  type WebhookFilters,
} from "./types";
