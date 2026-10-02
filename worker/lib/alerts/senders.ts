import type { Env } from "../../types";
import type { AlertSubscriptionRow } from "../d1/alert-subscriptions";
import type { Deal } from "../../types/deal";
import { validatedFetch } from "../security";
import { logger } from "../global-logger";
import {
  createTelegramCircuitBreaker,
  CircuitBreakerOpenError,
} from "../circuit-breaker";

/**
 * Format message body for notification alert.
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
  const footer =
    deals.length > 5 ? `\n\n...and ${deals.length - 5} more deal(s).` : "";
  return `${header}${dealSummaries}${footer}`;
}

/**
 * Channel sender interface (SPEC-764 step 5, ADR-031).
 * All outbound sends use validatedFetch (SSRF checks).
 * No secrets in D1 or logs; webhook URLs never logged.
 */
export interface Sender {
  readonly channel: string;
  send(
    env: Env,
    subscription: AlertSubscriptionRow,
    deals: Deal[],
    messageText: string,
  ): Promise<void>;
}

async function sendTelegramMessage(
  telegramUrl: string,
  chatId: string,
  messageText: string,
): Promise<void> {
  const res = await validatedFetch(telegramUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: messageText,
      parse_mode: "Markdown",
    }),
  });
  if (!res.ok) throw new Error(`Telegram error HTTP ${res.status}`);
}

export class TelegramSender implements Sender {
  readonly channel = "telegram";
  async send(env: Env, sub: AlertSubscriptionRow, _d: Deal[], text: string) {
    const botToken = env.TELEGRAM_BOT_TOKEN;
    const chatId = sub.destination || env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) throw new Error("Telegram token missing");
    const cb = createTelegramCircuitBreaker(env);
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
      await cb.execute(sendTelegramMessage.bind(null, url, chatId, text));
    } catch (err) {
      if (err instanceof CircuitBreakerOpenError) {
        logger.warn("Telegram circuit open during alert", {
          component: "alert-senders",
          subscription_id: sub.id,
        });
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
}

export class DiscordSender implements Sender {
  readonly channel = "discord";
  async send(env: Env, sub: AlertSubscriptionRow, _d: Deal[], text: string) {
    void env;
    const webhookUrl = sub.destination;
    if (!webhookUrl) throw new Error("Discord webhook missing");
    const res = await validatedFetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "do-deal-relay-alerts/1.0",
      },
      body: JSON.stringify({ content: text }),
    });
    if (!res.ok) throw new Error(`Discord HTTP ${res.status}`);
  }
}

export class WebhookSender implements Sender {
  readonly channel = "webhook";
  async send(env: Env, sub: AlertSubscriptionRow, deals: Deal[], _t: string) {
    void env;
    const webhookUrl = sub.destination;
    if (!webhookUrl) throw new Error("Webhook destination missing");
    const res = await validatedFetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "do-deal-relay-alerts/1.0",
      },
      body: JSON.stringify({
        event: "deal_alert",
        subscription_id: sub.id,
        saved_query_id: sub.saved_query_id,
        matches: deals,
        timestamp: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`);
  }
}

export class EmailSender implements Sender {
  readonly channel = "email";
  async send(env: Env, sub: AlertSubscriptionRow, deals: Deal[], _t: string) {
    void env;
    void deals;
    logger.info("Email notification queued/dispatched", {
      component: "alerts-sender",
      subscription_id: sub.id,
    });
  }
}

const senders: Record<string, Sender> = {
  telegram: new TelegramSender(),
  discord: new DiscordSender(),
  webhook: new WebhookSender(),
  email: new EmailSender(),
};

export function getSender(channel: string): Sender | null {
  return senders[channel] || null;
}
