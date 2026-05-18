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
  // Normalize path by removing /api prefix if present
  const normalizedPath = path.startsWith("/api")
    ? path.replace("/api", "")
    : path;

  // Incoming webhooks (public, signature verified)
  if (
    normalizedPath.startsWith("/webhooks/incoming/") &&
    request.method === "POST"
  ) {
    const partnerId = normalizedPath
      .replace("/webhooks/incoming/", "")
      .split("/")[0];
    if (partnerId) return handleIncomingWebhookRequest(request, env, partnerId);
  }

  // Specific notification endpoints (POST /api/webhooks/deals/created, etc.)
  // These are handled as incoming webhooks with a system or partner context
  const notificationMatch = normalizedPath.match(
    /^\/webhooks\/(deals|referrals|research|system)\/([^/]+)$/,
  );
  if (notificationMatch && request.method === "POST") {
    const partnerId = request.headers.get("X-Partner-Id") || "system";
    return handleIncomingWebhookRequest(request, env, partnerId);
  }

  // Subscription management (requires API key auth)
  if (normalizedPath === "/webhooks/subscribe" && request.method === "POST") {
    return handleSubscribe(request, env);
  }

  if (normalizedPath === "/webhooks/unsubscribe" && request.method === "POST") {
    return handleUnsubscribe(request, env);
  }

  if (
    normalizedPath === "/webhooks/subscriptions" &&
    request.method === "GET"
  ) {
    return handleListSubscriptions(request, env);
  }

  // Partner management (admin only)
  if (normalizedPath === "/webhooks/partners" && request.method === "POST") {
    return handleCreatePartner(request, env);
  }

  if (
    normalizedPath.startsWith("/webhooks/partners/") &&
    request.method === "GET"
  ) {
    const partnerId = normalizedPath
      .replace("/webhooks/partners/", "")
      .split("/")[0];
    if (partnerId) return handleGetPartner(request, env, partnerId);
  }

  // Dead letter queue management
  if (normalizedPath === "/webhooks/dlq" && request.method === "GET") {
    return handleGetDeadLetterQueue(request, env);
  }

  if (
    normalizedPath.startsWith("/webhooks/dlq/") &&
    request.method === "POST"
  ) {
    const parts = normalizedPath.replace("/webhooks/dlq/", "").split("/");
    const eventId = parts[0];
    const subscriptionId = parts[1];
    if (eventId && subscriptionId)
      return handleRetryDeadLetter(request, env, eventId, subscriptionId);
  }

  // Bidirectional sync
  if (normalizedPath === "/webhooks/sync" && request.method === "POST") {
    return handleCreateSyncConfig(request, env);
  }

  if (
    normalizedPath.startsWith("/webhooks/sync/") &&
    request.method === "GET"
  ) {
    const partnerId = normalizedPath
      .replace("/webhooks/sync/", "")
      .split("/")[0];
    if (partnerId) return handleGetSyncState(request, env, partnerId);
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
