/**
 * Alert queue budgets (SPEC-deal-alerts-764 step 4, ADR-031).
 * Free-tier caps: 500 messages per publish, 10 matches per subscription.
 * Overflow rolls to digest, never silent drop. Binding missing or budget
 * exhausted falls back to inline best-effort plus KV-DLQ overflow.
 */

export const MAX_ALERT_QUEUE_MESSAGES_PER_PUBLISH = 500;
export const MAX_MATCHES_PER_SUBSCRIPTION_PER_PUBLISH = 10;

export interface CappedMatches {
  kept: string[];
  overflowCount: number;
  rolledToDigest: boolean;
}

/**
 * Cap per-subscription matches. Truncates whole IDs so payload stays valid.
 */
export function capMatchesPerSubscription(dealIds: string[]): CappedMatches {
  if (dealIds.length <= MAX_MATCHES_PER_SUBSCRIPTION_PER_PUBLISH) {
    return { kept: dealIds, overflowCount: 0, rolledToDigest: false };
  }
  return {
    kept: dealIds.slice(0, MAX_MATCHES_PER_SUBSCRIPTION_PER_PUBLISH),
    overflowCount: dealIds.length - MAX_MATCHES_PER_SUBSCRIPTION_PER_PUBLISH,
    rolledToDigest: true,
  };
}

export interface PublishCap {
  allowed: number;
  dropped: number;
}

/**
 * Cap total queue messages per publish batch.
 */
export function capPublishMessages(totalProposed: number): PublishCap {
  if (totalProposed <= MAX_ALERT_QUEUE_MESSAGES_PER_PUBLISH) {
    return { allowed: totalProposed, dropped: 0 };
  }
  return {
    allowed: MAX_ALERT_QUEUE_MESSAGES_PER_PUBLISH,
    dropped: totalProposed - MAX_ALERT_QUEUE_MESSAGES_PER_PUBLISH,
  };
}
