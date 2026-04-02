// ============================================================================
// Webhook Handler - Incoming/Outgoing Webhook Management
// ============================================================================

import type { Env, ReferralInput } from "../types";
import { logger } from "./global-logger";
import { handleError } from "./error-handler";
import {
  verifyHmacSignature,
  generateWebhookHeaders,
  parseSignatureHeader,
  hashIdempotencyKey,
  hashRequest,
  generateWebhookSecret,
} from "./hmac";
import {
  storeReferralInput,
  getReferralByCode,
  deactivateReferral,
} from "./referral-storage";
import { generateDealId } from "./crypto";

// ============================================================================
// Types
// ============================================================================

export interface WebhookSubscription {
  id: string;
  partner_id: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
  retry_policy?: RetryPolicy;
  filters?: WebhookFilters;
}

export type WebhookEventType =
  | "referral.created"
  | "referral.updated"
  | "referral.deactivated"
  | "referral.expired"
  | "referral.validated"
  | "referral.quarantined"
  | "ping";

export interface RetryPolicy {
  max_attempts: number;
  initial_delay_ms: number;
  max_delay_ms: number;
  backoff_multiplier: number;
}

export interface WebhookFilters {
  domains?: string[];
  status?: string[];
}

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  data: unknown;
  metadata: {
    partner_id?: string;
    request_id: string;
    trace_id: string;
  };
}

export interface WebhookDelivery {
  event_id: string;
  subscription_id: string;
  status: "pending" | "delivered" | "failed" | "retrying";
  attempts: WebhookAttempt[];
  created_at: string;
  delivered_at?: string;
}

export interface WebhookAttempt {
  timestamp: string;
  status_code?: number;
  error?: string;
  response_body?: string;
}

export interface IncomingWebhookPayload {
  event: WebhookEventType;
  data: ReferralWebhookData;
  external_id?: string;
  metadata?: Record<string, unknown>;
}

export interface ReferralWebhookData {
  code: string;
  url: string;
  domain: string;
  title?: string;
  description?: string;
  reward?: {
    type: "cash" | "credit" | "percent" | "item";
    value?: number | string;
    currency?: string;
  };
  expires_at?: string;
  metadata?: Record<string, unknown>;
  status?: "active" | "inactive" | "expired" | "quarantined";
}

export interface WebhookPartner {
  id: string;
  name: string;
  secret: string;
  active: boolean;
  allowed_events: WebhookEventType[];
  rate_limit_per_minute: number;
  created_at: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  max_attempts: 5,
  initial_delay_ms: 1000,
  max_delay_ms: 60000,
  backoff_multiplier: 2,
};

const WEBHOOK_RATE_LIMIT_TTL = 3600; // 1 hour

// ============================================================================
// KV Helper - Use DEALS_STAGING for webhook data
// ============================================================================

function getWebhookKV(env: Env): KVNamespace | null {
  // Use DEALS_WEBHOOKS if available, otherwise fallback to DEALS_STAGING
  return env.DEALS_WEBHOOKS || env.DEALS_STAGING || null;
}

// ============================================================================
// Partner Management
// ============================================================================

const WEBHOOK_PARTNERS_KEY = "webhook_partners";

export async function getWebhookPartner(
  env: Env,
  partnerId: string,
): Promise<WebhookPartner | null> {
  const partners = await getWebhookPartners(env);
  return partners.find((p) => p.id === partnerId) || null;
}

export async function getWebhookPartners(env: Env): Promise<WebhookPartner[]> {
  try {
    const kv = getWebhookKV(env);
    if (!kv) return [];
    const data = await kv.get(WEBHOOK_PARTNERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveWebhookPartner(
  env: Env,
  partner: WebhookPartner,
): Promise<void> {
  const kv = getWebhookKV(env);
  if (!kv) throw new Error("No KV namespace available for webhooks");

  const partners = await getWebhookPartners(env);
  const existingIndex = partners.findIndex((p) => p.id === partner.id);

  if (existingIndex >= 0) {
    partners[existingIndex] = partner;
  } else {
    partners.push(partner);
  }

  await kv.put(WEBHOOK_PARTNERS_KEY, JSON.stringify(partners));
}

export async function createWebhookPartner(
  env: Env,
  name: string,
  allowedEvents: WebhookEventType[] = ["referral.created"],
  rateLimitPerMinute: number = 60,
): Promise<WebhookPartner> {
  const partner: WebhookPartner = {
    id: `partner_${generateId()}`,
    name,
    secret: generateWebhookSecret(),
    active: true,
    allowed_events: allowedEvents,
    rate_limit_per_minute: rateLimitPerMinute,
    created_at: new Date().toISOString(),
  };

  await saveWebhookPartner(env, partner);
  return partner;
}

// ============================================================================
// Subscription Management
// ============================================================================

export async function createSubscription(
  env: Env,
  partnerId: string,
  url: string,
  events: WebhookEventType[],
  metadata?: Record<string, unknown>,
  retryPolicy?: Partial<RetryPolicy>,
  filters?: WebhookFilters,
): Promise<WebhookSubscription> {
  const kv = getWebhookKV(env);
  if (!kv) throw new Error("No KV namespace available for webhooks");

  const subscription: WebhookSubscription = {
    id: `sub_${generateId()}`,
    partner_id: partnerId,
    url,
    events,
    secret: generateWebhookSecret(),
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata,
    retry_policy: { ...DEFAULT_RETRY_POLICY, ...retryPolicy },
    filters,
  };

  await kv.put(
    `webhook_subscription:${subscription.id}`,
    JSON.stringify(subscription),
  );

  // Update partner's subscription list
  const existingIds = await getPartnerSubscriptionIds(env, partnerId);
  await kv.put(
    `webhook_subscriptions:${partnerId}`,
    JSON.stringify([...existingIds, subscription.id]),
  );

  logger.info(`Webhook subscription created: ${subscription.id}`, {
    component: "webhook",
    partner_id: partnerId,
    events,
  });

  return subscription;
}

export async function getSubscription(
  env: Env,
  subscriptionId: string,
): Promise<WebhookSubscription | null> {
  const kv = getWebhookKV(env);
  if (!kv) return null;
  const data = await kv.get(`webhook_subscription:${subscriptionId}`);
  return data ? JSON.parse(data) : null;
}

export async function getPartnerSubscriptions(
  env: Env,
  partnerId: string,
): Promise<WebhookSubscription[]> {
  const ids = await getPartnerSubscriptionIds(env, partnerId);
  const subscriptions: WebhookSubscription[] = [];

  for (const id of ids) {
    const sub = await getSubscription(env, id);
    if (sub) subscriptions.push(sub);
  }

  return subscriptions;
}

async function getPartnerSubscriptionIds(
  env: Env,
  partnerId: string,
): Promise<string[]> {
  const kv = getWebhookKV(env);
  if (!kv) return [];
  const data = await kv.get(`webhook_subscriptions:${partnerId}`);
  return data ? JSON.parse(data) : [];
}

export async function updateSubscription(
  env: Env,
  subscriptionId: string,
  updates: Partial<Omit<WebhookSubscription, "id" | "created_at">>,
): Promise<WebhookSubscription | null> {
  const kv = getWebhookKV(env);
  if (!kv) return null;

  const subscription = await getSubscription(env, subscriptionId);
  if (!subscription) return null;

  const updated = {
    ...subscription,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  await kv.put(
    `webhook_subscription:${subscriptionId}`,
    JSON.stringify(updated),
  );

  return updated;
}

export async function deleteSubscription(
  env: Env,
  subscriptionId: string,
): Promise<boolean> {
  const kv = getWebhookKV(env);
  if (!kv) return false;

  const subscription = await getSubscription(env, subscriptionId);
  if (!subscription) return false;

  await kv.delete(`webhook_subscription:${subscriptionId}`);

  // Remove from partner's list
  const ids = await getPartnerSubscriptionIds(env, subscription.partner_id);
  const updatedIds = ids.filter((id) => id !== subscriptionId);
  await kv.put(
    `webhook_subscriptions:${subscription.partner_id}`,
    JSON.stringify(updatedIds),
  );

  return true;
}

// ============================================================================
// Incoming Webhook Handler
// ============================================================================

export interface IncomingWebhookResult {
  success: boolean;
  statusCode: number;
  message: string;
  referralId?: string;
  error?: string;
}

export async function handleIncomingWebhook(
  env: Env,
  partnerId: string,
  payload: string,
  headers: {
    signature: string;
    timestamp: string;
    webhookId: string;
    idempotencyKey?: string;
  },
): Promise<IncomingWebhookResult> {
  const requestId = generateId();
  logger.info(`Incoming webhook received: ${headers.webhookId}`, {
    component: "webhook",
    partner_id: partnerId,
    request_id: requestId,
  });

  try {
    // 1. Validate partner exists
    const partner = await getWebhookPartner(env, partnerId);
    if (!partner) {
      return {
        success: false,
        statusCode: 401,
        message: "Unknown partner",
        error: "Partner not found",
      };
    }

    if (!partner.active) {
      return {
        success: false,
        statusCode: 403,
        message: "Partner deactivated",
        error: "Partner account is not active",
      };
    }

    // 2. Check rate limit
    const rateLimitCheck = await checkRateLimit(
      env,
      partnerId,
      partner.rate_limit_per_minute,
    );
    if (!rateLimitCheck.allowed) {
      return {
        success: false,
        statusCode: 429,
        message: "Rate limit exceeded",
        error: `Retry after ${rateLimitCheck.retryAfter}s`,
      };
    }

    // 3. Check idempotency (if key provided)
    if (headers.idempotencyKey) {
      const idempotencyCheck = await checkIdempotency(
        env,
        headers.idempotencyKey,
        payload,
      );
      if (idempotencyCheck.cached) {
        return {
          success: true,
          statusCode: 200,
          message: "Duplicate event - already processed",
          referralId: idempotencyCheck.referralId,
        };
      }
    }

    // 4. Verify HMAC signature
    const timestamp = parseInt(headers.timestamp, 10);
    const signatureResult = await verifyHmacSignature(
      payload,
      headers.signature.replace("sha256=", ""),
      partner.secret,
      timestamp,
    );

    if (!signatureResult.valid) {
      logger.warn(
        `Invalid webhook signature from ${partnerId}: ${signatureResult.error}`,
        {
          component: "webhook",
          partner_id: partnerId,
        },
      );
      return {
        success: false,
        statusCode: 401,
        message: "Invalid signature",
        error: signatureResult.error,
      };
    }

    // 5. Parse and validate payload
    let webhookPayload: IncomingWebhookPayload;
    try {
      webhookPayload = JSON.parse(payload);
    } catch {
      return {
        success: false,
        statusCode: 400,
        message: "Invalid JSON payload",
        error: "Failed to parse request body as JSON",
      };
    }

    // 6. Validate event type
    if (!partner.allowed_events.includes(webhookPayload.event)) {
      return {
        success: false,
        statusCode: 400,
        message: "Event type not allowed",
        error: `Event '${webhookPayload.event}' is not in allowed list: ${partner.allowed_events.join(", ")}`,
      };
    }

    // 7. Process based on event type
    const result = await processWebhookEvent(env, webhookPayload, partnerId);

    // 8. Cache idempotency result
    if (headers.idempotencyKey && result.referralId) {
      await cacheIdempotencyResult(
        env,
        headers.idempotencyKey,
        payload,
        result.referralId,
      );
    }

    return result;
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleIncomingWebhook",
      partner_id: partnerId,
    });

    return {
      success: false,
      statusCode: 500,
      message: "Internal error processing webhook",
      error: err.message,
    };
  }
}

// ============================================================================
// Event Processing
// ============================================================================

async function processWebhookEvent(
  env: Env,
  payload: IncomingWebhookPayload,
  partnerId: string,
): Promise<IncomingWebhookResult> {
  switch (payload.event) {
    case "referral.created":
    case "referral.updated":
      return await processReferralCreatedOrUpdated(
        env,
        payload.data,
        partnerId,
      );

    case "referral.deactivated":
      return await processReferralDeactivated(env, payload.data);

    case "referral.expired":
      return await processReferralExpired(env, payload.data);

    case "ping":
      return {
        success: true,
        statusCode: 200,
        message: "Pong",
      };

    default:
      return {
        success: false,
        statusCode: 400,
        message: "Unknown event type",
        error: `Cannot process event: ${payload.event}`,
      };
  }
}

async function processReferralCreatedOrUpdated(
  env: Env,
  data: ReferralWebhookData,
  partnerId: string,
): Promise<IncomingWebhookResult> {
  // Validate required fields
  if (!data.code || !data.url || !data.domain) {
    return {
      success: false,
      statusCode: 400,
      message: "Missing required fields",
      error: "Required: code, url, domain",
    };
  }

  // Verify URL is complete (CRITICAL: URL Preservation Rule)
  try {
    const urlObj = new URL(data.url);
    if (!urlObj.protocol || !urlObj.host) {
      throw new Error("Invalid URL");
    }
  } catch {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid URL",
      error: "URL must be complete with protocol (e.g., https://)",
    };
  }

  // Check if referral already exists
  const existing = await getReferralByCode(env, data.code);
  const now = new Date().toISOString();

  if (
    existing &&
    data.code === existing.code &&
    data.domain === existing.domain
  ) {
    // Update existing
    logger.info(`Updating existing referral from webhook: ${data.code}`, {
      component: "webhook",
      partner_id: partnerId,
    });

    return {
      success: true,
      statusCode: 200,
      message: "Referral already exists - no changes made",
      referralId: existing.id,
    };
  }

  // Create new referral
  const id = await generateDealId("webhook", data.code, "referral");
  const referral: ReferralInput = {
    id,
    code: data.code,
    url: data.url, // CRITICAL: Full URL preserved
    domain: data.domain,
    source: "api",
    status: data.status || "quarantined",
    submitted_at: now,
    submitted_by: partnerId,
    expires_at: data.expires_at,
    metadata: {
      title: data.title || `${data.domain} Referral`,
      description: data.description || `Referral code for ${data.domain}`,
      reward_type: data.reward?.type || "unknown",
      reward_value: data.reward?.value,
      currency: data.reward?.currency,
      category: (data.metadata?.category as string[]) || ["general"],
      tags: [
        "webhook",
        `partner:${partnerId}`,
        ...((data.metadata?.tags as string[]) || []),
      ],
      requirements: [], // No requirements for webhook submissions
      confidence_score: 0.7, // Higher confidence for API submissions
      notes: `Received via webhook from ${partnerId}`,
    },
  };

  await storeReferralInput(env, referral);

  logger.info(`Referral created from webhook: ${referral.code}`, {
    component: "webhook",
    partner_id: partnerId,
    referral_id: referral.id,
    url: referral.url,
  });

  // Trigger outgoing webhooks
  await sendOutgoingWebhooks(env, {
    id: `evt_${generateId()}`,
    type: "referral.created",
    timestamp: now,
    data: {
      id: referral.id,
      code: referral.code,
      url: referral.url,
      domain: referral.domain,
      status: referral.status,
      source: "webhook",
      partner_id: partnerId,
    },
    metadata: {
      partner_id: partnerId,
      request_id: generateId(),
      trace_id: generateId(),
    },
  });

  return {
    success: true,
    statusCode: 201,
    message: "Referral created successfully",
    referralId: referral.id,
  };
}

async function processReferralDeactivated(
  env: Env,
  data: ReferralWebhookData,
): Promise<IncomingWebhookResult> {
  if (!data.code) {
    return {
      success: false,
      statusCode: 400,
      message: "Missing code",
      error: "Code is required for deactivation",
    };
  }

  const referral = await deactivateReferral(env, data.code, "user_request");

  if (!referral) {
    return {
      success: false,
      statusCode: 404,
      message: "Referral not found",
      error: `No referral found with code: ${data.code}`,
    };
  }

  return {
    success: true,
    statusCode: 200,
    message: "Referral deactivated",
    referralId: referral.id,
  };
}

async function processReferralExpired(
  env: Env,
  data: ReferralWebhookData,
): Promise<IncomingWebhookResult> {
  // Similar to deactivated but with expired reason
  if (!data.code) {
    return {
      success: false,
      statusCode: 400,
      message: "Missing code",
      error: "Code is required for expiration",
    };
  }

  const referral = await deactivateReferral(env, data.code, "expired");

  if (!referral) {
    return {
      success: false,
      statusCode: 404,
      message: "Referral not found",
      error: `No referral found with code: ${data.code}`,
    };
  }

  return {
    success: true,
    statusCode: 200,
    message: "Referral marked as expired",
    referralId: referral.id,
  };
}

// ============================================================================
// Outgoing Webhooks
// ============================================================================

export async function sendOutgoingWebhooks(
  env: Env,
  event: WebhookEvent,
): Promise<void> {
  // Get all active subscriptions that want this event
  const allSubscriptions = await getAllActiveSubscriptions(env);
  const matchingSubscriptions = allSubscriptions.filter(
    (sub) =>
      sub.events.includes(event.type) &&
      isEventAllowedByFilters(event, sub.filters),
  );

  logger.info(
    `Sending outgoing webhooks: ${matchingSubscriptions.length} subscriptions`,
    {
      component: "webhook",
      event_type: event.type,
      event_id: event.id,
    },
  );

  // Send in parallel
  await Promise.all(
    matchingSubscriptions.map((sub) =>
      sendWebhookToSubscription(env, event, sub),
    ),
  );
}

async function getAllActiveSubscriptions(
  env: Env,
): Promise<WebhookSubscription[]> {
  try {
    const kv = getWebhookKV(env);
    if (!kv) return [];

    // List all subscription keys
    const keys = await kv.list({ prefix: "webhook_subscription:" });
    const subscriptions: WebhookSubscription[] = [];

    for (const key of keys.keys) {
      const data = await kv.get(key.name);
      if (data) {
        const sub = JSON.parse(data) as WebhookSubscription;
        if (sub.active) subscriptions.push(sub);
      }
    }
    return subscriptions;
  } catch {
    return [];
  }
}

function isEventAllowedByFilters(
  event: WebhookEvent,
  filters?: WebhookFilters,
): boolean {
  if (!filters) return true;

  const data = event.data as { domain?: string; status?: string };

  if (filters.domains && filters.domains.length > 0 && data.domain) {
    if (!filters.domains.includes(data.domain)) return false;
  }

  if (filters.status && filters.status.length > 0 && data.status) {
    if (!filters.status.includes(data.status)) return false;
  }

  return true;
}

async function sendWebhookToSubscription(
  env: Env,
  event: WebhookEvent,
  subscription: WebhookSubscription,
): Promise<void> {
  const payload = JSON.stringify(event);
  const retryPolicy = subscription.retry_policy || DEFAULT_RETRY_POLICY;

  const delivery: WebhookDelivery = {
    event_id: event.id,
    subscription_id: subscription.id,
    status: "pending",
    attempts: [],
    created_at: new Date().toISOString(),
  };

  for (let attempt = 1; attempt <= retryPolicy.max_attempts; attempt++) {
    try {
      const headers = await generateWebhookHeaders(
        payload,
        subscription.secret,
        event.id,
        event.type,
      );

      const response = await fetch(subscription.url, {
        method: "POST",
        headers,
        body: payload,
      });

      const attemptRecord: WebhookAttempt = {
        timestamp: new Date().toISOString(),
        status_code: response.status,
      };

      if (response.status >= 200 && response.status < 300) {
        // Success
        delivery.status = "delivered";
        delivery.delivered_at = attemptRecord.timestamp;
        delivery.attempts.push(attemptRecord);

        logger.info(`Webhook delivered: ${event.id} to ${subscription.url}`, {
          component: "webhook",
          event_id: event.id,
          subscription_id: subscription.id,
          attempts: attempt,
        });

        break;
      } else {
        // Failed - retry
        attemptRecord.response_body = await response.text();
        delivery.attempts.push(attemptRecord);
        delivery.status =
          attempt < retryPolicy.max_attempts ? "retrying" : "failed";

        if (attempt < retryPolicy.max_attempts) {
          const delay = calculateBackoff(attempt, retryPolicy);
          await sleep(delay);
        }
      }
    } catch (error) {
      const attemptRecord: WebhookAttempt = {
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      };
      delivery.attempts.push(attemptRecord);
      delivery.status =
        attempt < retryPolicy.max_attempts ? "retrying" : "failed";

      if (attempt < retryPolicy.max_attempts) {
        const delay = calculateBackoff(attempt, retryPolicy);
        await sleep(delay);
      }
    }
  }

  // Save delivery record
  const kv = getWebhookKV(env);
  if (kv) {
    await kv.put(
      `webhook_delivery:${delivery.event_id}:${subscription.id}`,
      JSON.stringify(delivery),
      { expirationTtl: 7 * 24 * 60 * 60 }, // 7 days
    );
  }

  // If failed after all retries, add to dead letter queue
  if (delivery.status === "failed") {
    await addToDeadLetterQueue(env, delivery, event);
  }
}

function calculateBackoff(attempt: number, policy: RetryPolicy): number {
  const base = policy.initial_delay_ms;
  const multiplier = Math.pow(policy.backoff_multiplier, attempt - 1);
  const jitter = Math.random() * 1000; // Add randomness

  return Math.min(base * multiplier + jitter, policy.max_delay_ms);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Dead Letter Queue
// ============================================================================

interface DeadLetterEvent {
  delivery: WebhookDelivery;
  event: WebhookEvent;
  enqueued_at: string;
  retryable: boolean;
}

async function addToDeadLetterQueue(
  env: Env,
  delivery: WebhookDelivery,
  event: WebhookEvent,
): Promise<void> {
  const kv = getWebhookKV(env);
  if (!kv) return;

  const dlqEntry: DeadLetterEvent = {
    delivery,
    event,
    enqueued_at: new Date().toISOString(),
    retryable: true,
  };

  await kv.put(
    `webhook_dlq:${delivery.event_id}:${delivery.subscription_id}`,
    JSON.stringify(dlqEntry),
    { expirationTtl: 30 * 24 * 60 * 60 }, // 30 days
  );

  logger.warn(`Webhook added to DLQ: ${delivery.event_id}`, {
    component: "webhook",
    event_id: delivery.event_id,
    subscription_id: delivery.subscription_id,
    attempts: delivery.attempts.length,
  });
}

export async function getDeadLetterQueue(env: Env): Promise<DeadLetterEvent[]> {
  try {
    const kv = getWebhookKV(env);
    if (!kv) return [];

    const keys = await kv.list({ prefix: "webhook_dlq:" });
    const entries: DeadLetterEvent[] = [];

    for (const key of keys.keys) {
      const data = await kv.get(key.name);
      if (data) entries.push(JSON.parse(data));
    }
    return entries;
  } catch {
    return [];
  }
}

export async function retryDeadLetterEvent(
  env: Env,
  eventId: string,
  subscriptionId: string,
): Promise<boolean> {
  const kv = getWebhookKV(env);
  if (!kv) return false;

  const key = `webhook_dlq:${eventId}:${subscriptionId}`;
  const data = await kv.get(key);
  if (!data) return false;

  const dlqEntry = JSON.parse(data) as DeadLetterEvent;

  // Delete from DLQ
  await kv.delete(key);

  // Retry sending
  const subscription = await getSubscription(env, subscriptionId);
  if (!subscription || !subscription.active) return false;

  await sendWebhookToSubscription(env, dlqEntry.event, subscription);
  return true;
}

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

async function checkRateLimit(
  env: Env,
  partnerId: string,
  limitPerMinute: number,
): Promise<RateLimitResult> {
  const kv = getWebhookKV(env);
  if (!kv) return { allowed: true }; // Allow if no KV

  const key = `webhook_ratelimit:${partnerId}`;
  const now = Date.now();
  const windowStart = Math.floor(now / 60000) * 60000; // Start of current minute

  const stored = await kv.get(key);
  let count = 0;

  if (stored) {
    const data = JSON.parse(stored) as { count: number; window: number };
    if (data.window === windowStart) {
      count = data.count;
    }
  }

  if (count >= limitPerMinute) {
    const retryAfter = Math.ceil((windowStart + 60000 - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Increment count
  await kv.put(
    key,
    JSON.stringify({ count: count + 1, window: windowStart }),
    { expirationTtl: 120 }, // 2 minutes
  );

  return { allowed: true };
}

// ============================================================================
// Idempotency
// ============================================================================

interface IdempotencyCheck {
  cached: boolean;
  referralId?: string;
}

interface IdempotencyRecord {
  key: string;
  payload_hash: string;
  referral_id: string;
  created_at: string;
  expires_at: string;
}

async function checkIdempotency(
  env: Env,
  key: string,
  payload: string,
): Promise<IdempotencyCheck> {
  const kv = getWebhookKV(env);
  if (!kv) return { cached: false };

  const hashedKey = await hashIdempotencyKey(key);
  const stored = await kv.get(`idempotency:${hashedKey}`);

  if (!stored) {
    return { cached: false };
  }

  const record = JSON.parse(stored) as IdempotencyRecord;
  const now = new Date().toISOString();

  // Check if expired
  if (now > record.expires_at) {
    return { cached: false };
  }

  // Check payload hash matches
  const payloadHash = await hashRequest("POST", "/webhook", payload);
  if (record.payload_hash !== payloadHash) {
    // Same key, different payload = conflict
    throw new Error("Idempotency key conflict: different payload");
  }

  return { cached: true, referralId: record.referral_id };
}

async function cacheIdempotencyResult(
  env: Env,
  key: string,
  payload: string,
  referralId: string,
): Promise<void> {
  const kv = getWebhookKV(env);
  if (!kv) return;

  const hashedKey = await hashIdempotencyKey(key);
  const payloadHash = await hashRequest("POST", "/webhook", payload);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  const record: IdempotencyRecord = {
    key: hashedKey,
    payload_hash: payloadHash,
    referral_id: referralId,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  await kv.put(`idempotency:${hashedKey}`, JSON.stringify(record), {
    expirationTtl: 24 * 60 * 60,
  });
}

// ============================================================================
// Utilities
// ============================================================================

function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 11)}`;
}

// ============================================================================
// Bidirectional Sync
// ============================================================================

export interface SyncConfig {
  partner_id: string;
  direction: "push" | "pull" | "bidirectional";
  mode: "realtime" | "scheduled" | "manual";
  schedule?: {
    cron: string;
    timezone: string;
  };
  conflict_resolution: "timestamp" | "priority" | "manual";
  priority: "local" | "remote";
  filters?: {
    domains?: string[];
    status?: string[];
    created_after?: string;
  };
  field_mapping?: Record<string, string>;
}

export interface SyncState {
  partner_id: string;
  last_sync_at: string;
  cursor?: string;
  sync_version: number;
  pending_changes: number;
  last_error?: string;
  status: "idle" | "syncing" | "error";
}

export async function getSyncState(
  env: Env,
  partnerId: string,
): Promise<SyncState | null> {
  const kv = getWebhookKV(env);
  if (!kv) return null;
  const data = await kv.get(`sync_state:${partnerId}`);
  return data ? JSON.parse(data) : null;
}

export async function saveSyncState(env: Env, state: SyncState): Promise<void> {
  const kv = getWebhookKV(env);
  if (!kv) return;
  await kv.put(`sync_state:${state.partner_id}`, JSON.stringify(state));
}

export async function createSyncConfig(
  env: Env,
  config: Omit<SyncConfig, "id">,
): Promise<SyncConfig & { id: string }> {
  const kv = getWebhookKV(env);
  if (!kv) throw new Error("No KV namespace available for webhooks");

  const id = `sync_${generateId()}`;
  const fullConfig = { ...config, id };

  await kv.put(`sync_config:${id}`, JSON.stringify(fullConfig));

  const existingIds = await getPartnerSyncConfigIds(env, config.partner_id);
  await kv.put(
    `sync_configs:${config.partner_id}`,
    JSON.stringify([...existingIds, id]),
  );

  // Initialize sync state
  const state: SyncState = {
    partner_id: config.partner_id,
    last_sync_at: new Date(0).toISOString(),
    sync_version: 0,
    pending_changes: 0,
    status: "idle",
  };
  await saveSyncState(env, state);

  return fullConfig;
}

async function getPartnerSyncConfigIds(
  env: Env,
  partnerId: string,
): Promise<string[]> {
  const kv = getWebhookKV(env);
  if (!kv) return [];
  const data = await kv.get(`sync_configs:${partnerId}`);
  return data ? JSON.parse(data) : [];
}
