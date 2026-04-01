/**
 * Webhook System Template
 *
 * Event notifications with HMAC signature verification.
 */

export interface WebhookConfig {
  secret: string;
  retries: number | RetryConfig;
  timeout: number;
  maxPayloadSize?: number;
  allowedIPs?: string[];
  requireHttps?: boolean;
}

export interface RetryConfig {
  max: number;
  strategy: "fixed" | "exponential";
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
}

export interface WebhookPayload {
  url: string;
  event: string;
  payload: unknown;
  headers?: Record<string, string>;
  id?: string;
}

export interface WebhookDelivery {
  id: string;
  subscriptionId: string;
  event: string;
  status: "pending" | "delivered" | "failed";
  attempts: DeliveryAttempt[];
  createdAt: number;
}

export interface DeliveryAttempt {
  timestamp: number;
  statusCode?: number;
  responseTime?: number;
  error?: string;
}

export class WebhookSystem {
  private config: WebhookConfig;

  constructor(config: WebhookConfig) {
    this.config = config;
  }

  async send(payload: WebhookPayload): Promise<WebhookDelivery> {
    const delivery: WebhookDelivery = {
      id: payload.id || crypto.randomUUID(),
      subscriptionId: payload.url,
      event: payload.event,
      status: "pending",
      attempts: [],
      createdAt: Date.now(),
    };

    const maxRetries =
      typeof this.config.retries === "number"
        ? this.config.retries
        : this.config.retries.max;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const attemptStart = Date.now();
      try {
        const response = await this.deliver(payload);
        delivery.attempts.push({
          timestamp: Date.now(),
          statusCode: response.status,
          responseTime: Date.now() - attemptStart,
        });

        if (response.ok) {
          delivery.status = "delivered";
          return delivery;
        }

        // Retry on 5xx or network errors
        if (response.status < 500) {
          delivery.status = "failed";
          return delivery;
        }
      } catch (error) {
        delivery.attempts.push({
          timestamp: Date.now(),
          error: String(error),
        });
      }

      if (attempt < maxRetries) {
        await this.delay(this.calculateDelay(attempt));
      }
    }

    delivery.status = "failed";
    return delivery;
  }

  private async deliver(payload: WebhookPayload): Promise<Response> {
    const signature = await this.sign(payload.payload);
    const body = JSON.stringify(payload.payload);

    return await fetch(payload.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": payload.event,
        "X-Webhook-Timestamp": String(Math.floor(Date.now() / 1000)),
        ...payload.headers,
      },
      body,
    });
  }

  private async sign(payload: unknown): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000);
    const data = `${timestamp}.${JSON.stringify(payload)}`;

    // HMAC-SHA256
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(this.config.secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(data),
    );
    const sigHex = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return `t=${timestamp},v1=${sigHex}`;
  }

  private calculateDelay(attempt: number): number {
    const config =
      typeof this.config.retries === "object"
        ? this.config.retries
        : {
            strategy: "exponential" as const,
            baseDelay: 1000,
            maxDelay: 60000,
            jitter: true,
          };

    let delay =
      config.strategy === "fixed"
        ? config.baseDelay
        : config.baseDelay * Math.pow(2, attempt);

    delay = Math.min(delay, config.maxDelay);

    if (config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return delay;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Verify webhook signature
export async function verifyWebhook(options: {
  secret: string;
  signature: string;
  payload: string;
  tolerance?: number;
}): Promise<boolean> {
  const { secret, signature, payload, tolerance = 300 } = options;

  // Parse signature
  const parts = signature.split(",");
  const t = parts.find((p) => p.startsWith("t="))?.split("=")[1];
  const v1 = parts.find((p) => p.startsWith("v1="))?.split("=")[1];

  if (!t || !v1) return false;

  // Check timestamp
  const timestamp = parseInt(t, 10);
  if (Math.abs(Date.now() / 1000 - timestamp) > tolerance) {
    return false;
  }

  // Verify signature
  const data = `${t}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const expected = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const expectedHex = Array.from(new Uint8Array(expected))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  return timingSafeEqual(v1, expectedHex);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Subscription management
export class SubscriptionManager {
  private subscriptions: Map<string, Subscription> = new Map();

  async subscribe(sub: Subscription): Promise<void> {
    this.subscriptions.set(sub.id, sub);
  }

  async unsubscribe(id: string): Promise<void> {
    this.subscriptions.delete(id);
  }

  getSubscriptionsForEvent(event: string): Subscription[] {
    return Array.from(this.subscriptions.values()).filter(
      (s) => s.events.includes(event) || s.events.includes("*"),
    );
  }
}

export interface Subscription {
  id: string;
  url: string;
  events: string[];
  secret: string;
}
