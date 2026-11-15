// ============================================================================
// Outgoing Webhook Queue - Durable delivery envelope
// ============================================================================

import type { Queue } from "@cloudflare/workers-types";
import type { Env } from "../../types";
import type { WebhookEvent } from "./types";

/**
 * Persisted unit of outgoing webhook work.
 *
 * The envelope carries the full event payload so the consumer does not depend
 * on a mutable read path, and a stable `deliveryId` so queue redelivery and
 * manual replay are idempotent. `enqueuedAt` is retained for latency metrics.
 */
export interface WebhookQueueMessage {
  deliveryId: string;
  event: WebhookEvent;
  subscriptionId: string;
  enqueuedAt: string;
}

/**
 * Queue `sendBatch` accepts at most 100 messages. Deliveries above this bound
 * use the inline fallback rather than silently dropping subscribers.
 */
export const WEBHOOK_QUEUE_MAX_BATCH = 100;

/**
 * Stable delivery identity shared by the producer, consumer, and DLQ/replay
 * paths. Event IDs are unique per emitted event; subscription IDs are stable.
 */
export function webhookDeliveryId(
  eventId: string,
  subscriptionId: string,
): string {
  return `${eventId}:${subscriptionId}`;
}

export function getWebhookQueue(env: Env): Queue<WebhookQueueMessage> | null {
  return (env.WEBHOOK_QUEUE as Queue<WebhookQueueMessage> | undefined) ?? null;
}
