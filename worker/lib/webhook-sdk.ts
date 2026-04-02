// ============================================================================
// Webhook SDK for Partners
// ============================================================================
// This SDK helps partners send webhooks to and receive webhooks from
// the referral management system.
//
// Features:
// - HMAC-SHA256 signature generation/verification
// - Retry logic with exponential backoff
// - Type-safe event handling
// - URL preservation (CRITICAL)
//
// Usage:
// ```typescript
// import { WebhookClient, WebhookServer } from './webhook-sdk';
//
// // Sending webhooks (outgoing from partner)
// const client = new WebhookClient({
//   baseUrl: 'https://api.example.com/webhooks/incoming/my-partner',
//   secret: 'whsec_xxx'
// });
//
// await client.sendReferralCreated({
//   code: 'ABC123',
//   url: 'https://example.com/invite/ABC123', // FULL URL
//   domain: 'example.com'
// });
//
// // Receiving webhooks (incoming to partner)
// const server = new WebhookServer({ secret: 'whsec_xxx' });
//
// app.post('/webhooks', async (req, res) => {
//   const event = await server.verifyAndParse(req.body, req.headers);
//   console.log(event.data.url); // Always a complete URL
// });
// ```

import {
  generateHmacSignature,
  verifyHmacSignature,
  parseSignatureHeader,
} from "./hmac";

// ============================================================================
// Types
// ============================================================================

export type WebhookEventType =
  | "referral.created"
  | "referral.updated"
  | "referral.deactivated"
  | "referral.expired"
  | "referral.validated"
  | "referral.quarantined"
  | "ping";

export interface ReferralWebhookData {
  code: string;
  url: string; // CRITICAL: Always complete URL with protocol
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

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  data: ReferralWebhookData | Record<string, unknown>;
  metadata?: {
    partner_id?: string;
    request_id?: string;
    trace_id?: string;
  };
}

export interface WebhookClientConfig {
  baseUrl: string;
  secret: string;
  partnerId: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface WebhookServerConfig {
  secret: string;
  timestampToleranceSeconds?: number;
}

// ============================================================================
// Webhook Client - For partners sending webhooks TO our system
// ============================================================================

export class WebhookClient {
  private config: Required<WebhookClientConfig>;

  constructor(config: WebhookClientConfig) {
    this.config = {
      timeoutMs: 30000,
      maxRetries: 3,
      ...config,
    };
  }

  /**
   * Send a referral.created event
   * CRITICAL: url must be a complete URL with protocol
   */
  async sendReferralCreated(
    data: ReferralWebhookData,
    externalId?: string,
  ): Promise<{ success: boolean; referralId?: string; error?: string }> {
    this.validateUrl(data.url);

    return this.sendEvent({
      event: "referral.created",
      data,
      external_id: externalId,
    });
  }

  /**
   * Send a referral.updated event
   */
  async sendReferralUpdated(
    data: ReferralWebhookData,
    externalId?: string,
  ): Promise<{ success: boolean; referralId?: string; error?: string }> {
    this.validateUrl(data.url);

    return this.sendEvent({
      event: "referral.updated",
      data,
      external_id: externalId,
    });
  }

  /**
   * Send a referral.deactivated event
   */
  async sendReferralDeactivated(
    code: string,
    reason?: string,
  ): Promise<{ success: boolean; error?: string }> {
    return this.sendEvent({
      event: "referral.deactivated",
      data: {
        code,
        url: "", // Not required for deactivation
        domain: "",
        metadata: { reason },
      },
    });
  }

  /**
   * Send a ping event (health check)
   */
  async sendPing(): Promise<{ success: boolean; error?: string }> {
    return this.sendEvent({
      event: "ping",
      data: { code: "ping", url: "https://example.com", domain: "example.com" },
    });
  }

  /**
   * Generic event sender with retry logic
   */
  private async sendEvent(payload: {
    event: WebhookEventType;
    data: ReferralWebhookData;
    external_id?: string;
  }): Promise<{ success: boolean; referralId?: string; error?: string }> {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);

    // Generate signature
    const signature = await generateHmacSignature(
      body,
      this.config.secret,
      timestamp,
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-Signature": `sha256=${signature}`,
      "X-Webhook-Timestamp": timestamp.toString(),
      "X-Webhook-Id": `wh_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      "User-Agent": `WebhookClient/${this.config.partnerId}`,
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(this.config.baseUrl, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });

        const responseBody = await response.text();

        if (response.status >= 200 && response.status < 300) {
          const data = JSON.parse(responseBody) as { referral_id?: string };
          return { success: true, referralId: data.referral_id };
        }

        // Don't retry on 4xx errors (client errors)
        if (response.status >= 400 && response.status < 500) {
          return {
            success: false,
            error: `HTTP ${response.status}: ${responseBody}`,
          };
        }

        throw new Error(`HTTP ${response.status}: ${responseBody}`);
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.config.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      error: `Failed after ${this.config.maxRetries} attempts: ${lastError?.message}`,
    };
  }

  /**
   * Validate URL is complete (CRITICAL)
   */
  private validateUrl(url: string): void {
    try {
      const parsed = new URL(url);
      if (!parsed.protocol.startsWith("http")) {
        throw new Error("URL must use http or https protocol");
      }
    } catch {
      throw new Error(
        `Invalid URL: ${url}. URLs must be complete with protocol (e.g., https://example.com/invite/CODE)`,
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Webhook Server - For partners receiving webhooks FROM our system
// ============================================================================

export class WebhookServer {
  private config: Required<WebhookServerConfig>;

  constructor(config: WebhookServerConfig) {
    this.config = {
      timestampToleranceSeconds: 300, // 5 minutes
      ...config,
    };
  }

  /**
   * Verify and parse incoming webhook
   * Returns the parsed event or throws an error
   */
  async verifyAndParse(
    body: string,
    headers: {
      "x-webhook-signature"?: string;
      "x-webhook-timestamp"?: string;
      "x-webhook-id"?: string;
      "x-webhook-event-type"?: string;
    },
  ): Promise<WebhookEvent> {
    // Extract headers
    const signature = headers["x-webhook-signature"];
    const timestamp = headers["x-webhook-timestamp"];
    const eventId = headers["x-webhook-id"];
    const eventType = headers["x-webhook-event-type"];

    if (!signature || !timestamp || !eventId) {
      throw new Error("Missing required webhook headers");
    }

    // Parse signature header
    const parsed = parseSignatureHeader(signature);
    if (!parsed || parsed.algorithm !== "sha256") {
      throw new Error("Invalid signature format");
    }

    // Verify signature
    const signatureResult = await verifyHmacSignature(
      body,
      parsed.signature,
      this.config.secret,
      parseInt(timestamp, 10),
      this.config.timestampToleranceSeconds,
    );

    if (!signatureResult.valid) {
      throw new Error(
        `Signature verification failed: ${signatureResult.error}`,
      );
    }

    // Parse body
    let event: WebhookEvent;
    try {
      event = JSON.parse(body) as WebhookEvent;
    } catch {
      throw new Error("Invalid JSON in webhook body");
    }

    // Verify URL completeness (CRITICAL)
    if (event.data && typeof event.data === "object" && "url" in event.data) {
      const data = event.data as ReferralWebhookData;
      this.validateIncomingUrl(data.url);
    }

    return event;
  }

  /**
   * Quick verify without full parsing
   */
  async verify(
    body: string,
    signature: string,
    timestamp: string,
  ): Promise<boolean> {
    try {
      const parsed = parseSignatureHeader(signature);
      if (!parsed) return false;

      const result = await verifyHmacSignature(
        body,
        parsed.signature,
        this.config.secret,
        parseInt(timestamp, 10),
        this.config.timestampToleranceSeconds,
      );

      return result.valid;
    } catch {
      return false;
    }
  }

  /**
   * Parse event without verification (use only if already verified)
   */
  parseEvent(body: string): WebhookEvent {
    return JSON.parse(body) as WebhookEvent;
  }

  /**
   * Validate incoming URL is complete
   */
  private validateIncomingUrl(url: string): void {
    if (!url) return; // Some events may not have URLs

    try {
      const parsed = new URL(url);
      if (!parsed.protocol.startsWith("http")) {
        console.warn(`Webhook received URL without protocol: ${url}`);
      }
    } catch {
      console.warn(`Webhook received invalid URL: ${url}`);
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a webhook secret for new partners
 */
export function generatePartnerSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return (
    "whsec_" +
    Array.from(array)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Create webhook headers for manual requests
 */
export async function createWebhookHeaders(
  payload: string,
  secret: string,
  eventType: WebhookEventType,
  eventId?: string,
): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await generateHmacSignature(payload, secret, timestamp);

  return {
    "Content-Type": "application/json",
    "X-Webhook-Signature": `sha256=${signature}`,
    "X-Webhook-Timestamp": timestamp.toString(),
    "X-Webhook-Id":
      eventId ||
      `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    "X-Webhook-Event-Type": eventType,
    "X-Webhook-Version": "1.0",
  };
}

// ============================================================================
// Type Guards
// ============================================================================

export function isReferralCreatedEvent(
  event: WebhookEvent,
): event is WebhookEvent & {
  type: "referral.created";
  data: ReferralWebhookData;
} {
  return event.type === "referral.created";
}

export function isReferralUpdatedEvent(
  event: WebhookEvent,
): event is WebhookEvent & {
  type: "referral.updated";
  data: ReferralWebhookData;
} {
  return event.type === "referral.updated";
}

export function isReferralDeactivatedEvent(
  event: WebhookEvent,
): event is WebhookEvent & {
  type: "referral.deactivated";
  data: { code: string };
} {
  return event.type === "referral.deactivated";
}

export function isPingEvent(
  event: WebhookEvent,
): event is WebhookEvent & { type: "ping" } {
  return event.type === "ping";
}
