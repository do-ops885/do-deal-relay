import type { Env } from "../types";

// ============================================================================
// Webhook Types
// ============================================================================

export interface WebhookConfig {
  id: string;
  url: string;
  secret: string; // For HMAC signature
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
}

export type WebhookEvent =
  | "deal.discovered"
  | "deal.published"
  | "deal.expired"
  | "system.error";

export interface WebhookPayload {
  event: string;
  timestamp: string;
  run_id: string;
  data: unknown;
  signature: string; // HMAC-SHA256
}

// ============================================================================
// Constants
// ============================================================================

const WEBHOOK_KEY_PREFIX = "webhook:";
const WEBHOOK_INDEX_KEY = "webhooks:index";

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new webhook configuration
 */
export async function createWebhook(
  env: Env,
  config: Omit<WebhookConfig, "id" | "createdAt">,
): Promise<WebhookConfig> {
  const id = generateWebhookId();
  const createdAt = new Date().toISOString();

  const webhookConfig: WebhookConfig = {
    ...config,
    id,
    createdAt,
  };

  // Store the webhook config
  await env.DEALS_SOURCES.put(
    `${WEBHOOK_KEY_PREFIX}${id}`,
    JSON.stringify(webhookConfig),
  );

  // Update the index
  await addToWebhookIndex(env, id);

  return webhookConfig;
}

/**
 * List all webhook configurations
 */
export async function listWebhooks(env: Env): Promise<WebhookConfig[]> {
  const index = await getWebhookIndex(env);

  if (index.length === 0) {
    return [];
  }

  const webhooks: WebhookConfig[] = [];

  for (const id of index) {
    const config = await getWebhookById(env, id);
    if (config) {
      webhooks.push(config);
    }
  }

  return webhooks;
}

/**
 * Get a single webhook by ID
 */
export async function getWebhookById(
  env: Env,
  id: string,
): Promise<WebhookConfig | null> {
  const data = await env.DEALS_SOURCES.get(`${WEBHOOK_KEY_PREFIX}${id}`);

  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data) as WebhookConfig;
  } catch {
    return null;
  }
}

/**
 * Delete a webhook configuration
 */
export async function deleteWebhook(env: Env, id: string): Promise<void> {
  // Remove from index
  await removeFromWebhookIndex(env, id);

  // Delete the webhook config
  await env.DEALS_SOURCES.delete(`${WEBHOOK_KEY_PREFIX}${id}`);
}

/**
 * Toggle webhook active state
 */
export async function toggleWebhook(
  env: Env,
  id: string,
  active: boolean,
): Promise<void> {
  const config = await getWebhookById(env, id);

  if (!config) {
    throw new Error(`Webhook not found: ${id}`);
  }

  config.active = active;

  await env.DEALS_SOURCES.put(
    `${WEBHOOK_KEY_PREFIX}${id}`,
    JSON.stringify(config),
  );
}

/**
 * Update a webhook configuration
 */
export async function updateWebhook(
  env: Env,
  id: string,
  updates: Partial<Omit<WebhookConfig, "id" | "createdAt">>,
): Promise<WebhookConfig> {
  const config = await getWebhookById(env, id);

  if (!config) {
    throw new Error(`Webhook not found: ${id}`);
  }

  const updatedConfig: WebhookConfig = {
    ...config,
    ...updates,
  };

  await env.DEALS_SOURCES.put(
    `${WEBHOOK_KEY_PREFIX}${id}`,
    JSON.stringify(updatedConfig),
  );

  return updatedConfig;
}

// ============================================================================
// Index Management
// ============================================================================

async function getWebhookIndex(env: Env): Promise<string[]> {
  const data = await env.DEALS_SOURCES.get(WEBHOOK_INDEX_KEY);

  if (!data) {
    return [];
  }

  try {
    return JSON.parse(data) as string[];
  } catch {
    return [];
  }
}

async function setWebhookIndex(env: Env, index: string[]): Promise<void> {
  await env.DEALS_SOURCES.put(WEBHOOK_INDEX_KEY, JSON.stringify(index));
}

async function addToWebhookIndex(env: Env, id: string): Promise<void> {
  const index = await getWebhookIndex(env);

  if (!index.includes(id)) {
    index.push(id);
    await setWebhookIndex(env, index);
  }
}

async function removeFromWebhookIndex(env: Env, id: string): Promise<void> {
  const index = await getWebhookIndex(env);
  const newIndex = index.filter((existingId) => existingId !== id);
  await setWebhookIndex(env, newIndex);
}

// ============================================================================
// Webhook Triggering
// ============================================================================

/**
 * Trigger webhooks for a specific event
 */
export async function triggerWebhooks(
  env: Env,
  event: WebhookEvent,
  data: unknown,
  run_id: string,
): Promise<void> {
  const webhooks = await listWebhooks(env);

  // Filter for active webhooks that subscribe to this event
  const activeWebhooks = webhooks.filter(
    (webhook) => webhook.active && webhook.events.includes(event),
  );

  if (activeWebhooks.length === 0) {
    return;
  }

  const timestamp = new Date().toISOString();

  // Fire webhooks in parallel with individual error handling
  const results = await Promise.allSettled(
    activeWebhooks.map(async (webhook) => {
      try {
        await sendWebhook(webhook, event, data, run_id, timestamp);
      } catch (error) {
        console.error(
          `Webhook delivery failed for ${webhook.id} to ${webhook.url}:`,
          error,
        );
        // Don't throw - we want to continue trying other webhooks
      }
    }),
  );

  // Log any failures
  const failures = results.filter((r) => r.status === "rejected").length;
  if (failures > 0) {
    console.warn(
      `${failures}/${activeWebhooks.length} webhooks failed to deliver`,
    );
  }
}

/**
 * Send a single webhook request
 */
async function sendWebhook(
  webhook: WebhookConfig,
  event: string,
  data: unknown,
  run_id: string,
  timestamp: string,
): Promise<void> {
  const payload: Omit<WebhookPayload, "signature"> = {
    event,
    timestamp,
    run_id,
    data,
  };

  // Generate signature
  const payloadString = JSON.stringify(payload);
  const signature = await generateWebhookSignature(
    payloadString,
    webhook.secret,
  );

  const fullPayload: WebhookPayload = {
    ...payload,
    signature,
  };

  // Send with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": event,
        "X-Webhook-ID": webhook.id,
        "User-Agent": "DealDiscovery/1.0",
      },
      body: JSON.stringify(fullPayload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log(`Webhook delivered successfully: ${webhook.id} -> ${event}`);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Webhook request timed out after 30 seconds");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// Signature Generation
// ============================================================================

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
export async function generateWebhookSignature(
  payload: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );

  // Convert to hex
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify a webhook signature
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const expected = await generateWebhookSignature(payload, secret);
  // Constant-time comparison to prevent timing attacks
  if (signature.length !== expected.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

// ============================================================================
// Utilities
// ============================================================================

function generateWebhookId(): string {
  return `wh_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Generate a cryptographically secure secret for webhooks
 */
export function generateWebhookSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
