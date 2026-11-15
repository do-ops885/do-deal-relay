// ============================================================================
// Webhook Delivery Records - Durable delivery identity and attempt history
// ============================================================================

import type { Env } from "../../types";
import type { WebhookDelivery } from "./types";
import { getWebhookKV } from "./types";
import { DELIVERY_CONSTANTS } from "./attempt";

const DELIVERY_PREFIX = "webhook_delivery:";

/**
 * Stable KV identity shared by the producer, consumer, and DLQ replay paths.
 */
export function deliveryRecordKey(
  eventId: string,
  subscriptionId: string,
): string {
  return `${DELIVERY_PREFIX}${eventId}:${subscriptionId}`;
}

/**
 * Persist a delivery record so replay/DLQ inspection and duplicate
 * suppression survive request or queue-consumer termination.
 */
export async function persistDeliveryRecord(
  env: Env,
  delivery: WebhookDelivery,
): Promise<void> {
  const kv = getWebhookKV(env);
  if (!kv) return;

  await kv.put(
    deliveryRecordKey(delivery.event_id, delivery.subscription_id),
    JSON.stringify(delivery),
    { expirationTtl: DELIVERY_CONSTANTS.DELIVERY_RECORD_EXPIRATION_SECONDS },
  );
}

/**
 * Read the current status for a stable delivery identity. Returns null when no
 * record exists yet.
 */
export async function getDeliveryRecordStatus(
  env: Env,
  eventId: string,
  subscriptionId: string,
): Promise<WebhookDelivery["status"] | null> {
  const record = await getDeliveryRecord(env, eventId, subscriptionId);
  return record?.status ?? null;
}

/**
 * Read the full delivery record so queue retries can append attempt history.
 */
export async function getDeliveryRecord(
  env: Env,
  eventId: string,
  subscriptionId: string,
): Promise<WebhookDelivery | null> {
  const kv = getWebhookKV(env);
  if (!kv) return null;

  return kv.get<WebhookDelivery>(
    deliveryRecordKey(eventId, subscriptionId),
    "json",
  );
}
