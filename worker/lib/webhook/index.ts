// ============================================================================
// Webhook Module - Re-exports for backward compatibility
// ============================================================================

// Types
export type {
  WebhookSubscription,
  WebhookEventType,
  RetryPolicy,
  WebhookFilters,
  WebhookEvent,
  WebhookDelivery,
  WebhookAttempt,
  IncomingWebhookPayload,
  ReferralWebhookData,
  WebhookPartner,
  IncomingWebhookResult,
  SyncConfig,
  SyncState,
} from "./types";

// Type constants and utilities
export {
  getWebhookKV,
  generateId,
  DEFAULT_RETRY_POLICY,
  WEBHOOK_RATE_LIMIT_TTL,
} from "./types";

// Partner and Subscription Management
export {
  getWebhookPartner,
  getWebhookPartners,
  saveWebhookPartner,
  createWebhookPartner,
  createSubscription,
  getSubscription,
  getPartnerSubscriptions,
  updateSubscription,
  deleteSubscription,
  getSyncState,
  saveSyncState,
  createSyncConfig,
} from "./subscriptions";

// Delivery and Retry Logic
export {
  sendOutgoingWebhooks,
  getDeadLetterQueue,
  retryDeadLetterEvent,
} from "./delivery";

// Incoming Webhook Processing
export { handleIncomingWebhook } from "./incoming";
