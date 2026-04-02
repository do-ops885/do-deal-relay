// ============================================================================
// Webhook System - Routes for Incoming/Outgoing Webhooks
// ============================================================================
// DEPRECATED: This file is a thin wrapper. Use worker/routes/webhooks/index.ts
// ============================================================================

export {
  handleWebhookRoutes,
  handleIncomingWebhookRequest,
  handleSubscribe,
  handleUnsubscribe,
  handleListSubscriptions,
  handleCreatePartner,
  handleGetPartner,
  handleGetDeadLetterQueue,
  handleRetryDeadLetter,
  handleCreateSyncConfig,
  handleGetSyncState,
  jsonResponse,
  type SubscribeRequest,
  type CreatePartnerRequest,
  type CreateSyncConfigRequest,
  type UnsubscribeRequest,
  VALID_WEBHOOK_EVENTS,
  type WebhookEventType,
  type RetryPolicy,
  type WebhookFilters,
} from "./webhooks/index";
