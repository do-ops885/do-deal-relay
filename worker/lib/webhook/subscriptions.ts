// ============================================================================
// Webhook Subscriptions - Partner and subscription management
// ============================================================================

import type { Env } from "../../types";
import type {
  WebhookPartner,
  WebhookSubscription,
  WebhookEventType,
  RetryPolicy,
  WebhookFilters,
  SyncConfig,
  SyncState,
} from "./types";
import { getWebhookKV, generateId, DEFAULT_RETRY_POLICY } from "./types";
import { generateWebhookSecret } from "../hmac";
import { logger } from "../global-logger";

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
// Bidirectional Sync
// ============================================================================

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
