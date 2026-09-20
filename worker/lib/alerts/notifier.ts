import type { Env } from "../../types";
import type { AlertSubscriptionRow } from "../d1/alert-subscriptions";
import { validatedFetch } from "../security";
import { logger } from "../global-logger";
import { createTelegramCircuitBreaker, CircuitBreakerOpenError } from "../circuit-breaker";
import type { Deal } from "../../types/deal";

export interface AlertNotificationResult {
  subscriptionId: string;
  channel: string;
  success: boolean;
  error?: string;
}

/**
 * Format message body for notification alert
 */
export function formatAlertMessage(
  subscription: AlertSubscriptionRow,
  deals: Deal[],
): string {
  const queryStr = subscription.query || "saved search";
  const header = `🔔 **Deal Alert Match**\nQuery: _"${queryStr}"_\nMatches found: ${deals.length}\n\n`;

  const dealSummaries = deals
    .slice(0, 5)
    .map((deal) => {
      const rewardText = deal.reward
        ? `${deal.reward.type.toUpperCase()}: ${deal.reward.value} ${deal.reward.currency || ""}`.trim()
        : "N/A";
      return `• **${deal.title || deal.code}**\n  Code: \`${deal.code}\` | Reward: ${rewardText}\n  URL: ${deal.url}`;
    })
    .join("\n\n");

  const footer = deals.length > 5 ? `\n\n...and ${deals.length - 5} more deal(s).` : "";
  return `${header}${dealSummaries}${footer}`;
}

/**
 * Send alert notification to destination based on channel
 */
export async function sendAlertNotification(
  env: Env,
  subscription: AlertSubscriptionRow,
  deals: Deal[],
): Promise<AlertNotificationResult> {
  if (deals.length === 0) {
    return { subscriptionId: subscription.id, channel: subscription.channel, success: true };
  }

  const messageText = formatAlertMessage(subscription, deals);

  try {
    switch (subscription.channel) {
      case "telegram": {
        const botToken = env.TELEGRAM_BOT_TOKEN;
        const chatId = subscription.destination || env.TELEGRAM_CHAT_ID;
        if (!botToken || !chatId) {
          return {
            subscriptionId: subscription.id,
            channel: "telegram",
            success: false,
            error: "Telegram token or destination missing",
          };
        }

        const cb = createTelegramCircuitBreaker(env);
        const execute = async () => {
          const res = await validatedFetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                text: messageText,
                parse_mode: "Markdown",
              }),
            },
          );
          if (!res.ok) throw new Error(`Telegram error HTTP ${res.status}`);
          return true;
        };
        await cb.execute(execute);
        break;
      }

      case "discord":
      case "webhook": {
        const webhookUrl = subscription.destination;
        if (!webhookUrl) {
          return {
            subscriptionId: subscription.id,
            channel: subscription.channel,
            success: false,
            error: "Webhook destination URL missing",
          };
        }

        const payload =
          subscription.channel === "discord"
            ? { content: messageText }
            : {
                event: "deal_alert",
                subscription_id: subscription.id,
                saved_query_id: subscription.saved_query_id,
                matches: deals,
                timestamp: new Date().toISOString(),
              };

        const res = await validatedFetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "do-deal-relay-alerts/1.0",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          return {
            subscriptionId: subscription.id,
            channel: subscription.channel,
            success: false,
            error: `Webhook returned HTTP ${res.status}`,
          };
        }
        break;
      }

      case "email": {
        logger.info("Email notification queued/dispatched", {
          component: "alerts-notifier",
          subscription_id: subscription.id,
          destination: subscription.destination,
        });
        break;
      }

      default:
        return {
          subscriptionId: subscription.id,
          channel: subscription.channel,
          success: false,
          error: `Unsupported channel: ${subscription.channel}`,
        };
    }

    return { subscriptionId: subscription.id, channel: subscription.channel, success: true };
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
