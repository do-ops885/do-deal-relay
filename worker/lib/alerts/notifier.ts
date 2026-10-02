import type { Env } from "../../types";
import type { AlertSubscriptionRow } from "../d1/alert-subscriptions";
import { logger } from "../global-logger";
import type { Deal } from "../../types/deal";
import { formatAlertMessage, getSender } from "./senders";
import { CircuitBreakerOpenError } from "../circuit-breaker";

export interface AlertNotificationResult {
  subscriptionId: string;
  channel: string;
  success: boolean;
  error?: string;
}

export { formatAlertMessage };

/**
 * Send alert notification to destination based on channel.
 * Delegates to Sender implementations (SPEC-764 step 5).
 */
export async function sendAlertNotification(
  env: Env,
  subscription: AlertSubscriptionRow,
  deals: Deal[],
): Promise<AlertNotificationResult> {
  if (deals.length === 0) {
    return {
      subscriptionId: subscription.id,
      channel: subscription.channel,
      success: true,
    };
  }

  const messageText = formatAlertMessage(subscription, deals);
  const sender = getSender(subscription.channel);
  if (!sender) {
    return {
      subscriptionId: subscription.id,
      channel: subscription.channel,
      success: false,
      error: `Unsupported channel: ${subscription.channel}`,
    };
  }

  try {
    await sender.send(env, subscription, deals, messageText);

    return {
      subscriptionId: subscription.id,
      channel: subscription.channel,
      success: true,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (error instanceof CircuitBreakerOpenError) {
      logger.warn("Telegram circuit breaker open during alert delivery", {
        component: "alerts-notifier",
        subscription_id: subscription.id,
      });
    }
    logger.error("Alert notification delivery failed", {
      component: "alerts-notifier",
      subscription_id: subscription.id,
      channel: subscription.channel,
      error: errorMsg,
    });
    return {
      subscriptionId: subscription.id,
      channel: subscription.channel,
      success: false,
      error: errorMsg,
    };
  }
}
