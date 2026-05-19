// ============================================================================
// Webhook Incoming - Incoming webhook processing
// ============================================================================

import type { Env, ReferralInput } from "../../types";
import type {
  IncomingWebhookResult,
  IncomingWebhookPayload,
  ReferralWebhookData,
  WebhookEvent,
  IdempotencyRecord,
  RateLimitResult,
  IdempotencyCheck,
} from "./types";
import { getWebhookKV, generateId } from "./types";
import { getWebhookPartner } from "./subscriptions";
import { sendOutgoingWebhooks } from "./delivery";
import { verifyHmacSignature, hashIdempotencyKey, hashRequest } from "../hmac";
import {
  storeReferralInput,
  getReferralByCode,
  deactivateReferral,
} from "../referral-storage";
import { generateDealId } from "../crypto";
import { logger } from "../global-logger";
import { handleError } from "../error-handler";

export async function handleIncomingWebhook(
  env: Env,
  partnerId: string,
  payload: string,
  headers: {
    signature: string;
    timestamp: string;
    webhookId: string;
    idempotencyKey?: string;
  },
): Promise<IncomingWebhookResult> {
  const requestId = generateId();
  logger.info(`Incoming webhook received: ${headers.webhookId}`, {
    component: "webhook",
    partner_id: partnerId,
    request_id: requestId,
  });

  try {
    // 1. Validate partner exists
    const partner = await getWebhookPartner(env, partnerId);
    if (!partner) {
      return {
        success: false,
        statusCode: 401,
        message: "Unknown partner",
        error: "Partner not found",
      };
    }

    if (!partner.active) {
      return {
        success: false,
        statusCode: 403,
        message: "Partner deactivated",
        error: "Partner account is not active",
      };
    }

    // 2. Check rate limit
    const rateLimitCheck = await checkRateLimit(
      env,
      partnerId,
      partner.rate_limit_per_minute,
    );
    if (!rateLimitCheck.allowed) {
      return {
        success: false,
        statusCode: 429,
        message: "Rate limit exceeded",
        error: `Retry after ${rateLimitCheck.retryAfter}s`,
      };
    }

    // 3. Check idempotency (if key provided)
    if (headers.idempotencyKey) {
      const idempotencyCheck = await checkIdempotency(
        env,
        headers.idempotencyKey,
        payload,
      );
      if (idempotencyCheck.cached) {
        return {
          success: true,
          statusCode: 200,
          message: "Duplicate event - already processed",
          referralId: idempotencyCheck.referralId,
        };
      }
    }

    // 4. Verify HMAC signature
    const timestamp = parseInt(headers.timestamp, 10);
    const signatureResult = await verifyHmacSignature(
      payload,
      headers.signature.replace("sha256=", ""),
      partner.secret,
      timestamp,
    );
    if (!signatureResult.valid) {
      logger.warn(
        `Invalid webhook signature from ${partnerId}: ${signatureResult.error}`,
        { component: "webhook", partner_id: partnerId },
      );
      return {
        success: false,
        statusCode: 401,
        message: "Invalid signature",
        error: signatureResult.error,
      };
    }

    // 5. Parse and validate payload
    let webhookPayload: IncomingWebhookPayload;
    try {
      webhookPayload = JSON.parse(payload);
    } catch {
      return {
        success: false,
        statusCode: 400,
        message: "Invalid JSON payload",
        error: "Failed to parse request body as JSON",
      };
    }

    // 6. Validate event type
    if (!partner.allowed_events.includes(webhookPayload.event)) {
      return {
        success: false,
        statusCode: 400,
        message: "Event type not allowed",
        error: `Event '${webhookPayload.event}' is not in allowed list: ${partner.allowed_events.join(", ")}`,
      };
    }

    // 7. Process based on event type
    const result = await processWebhookEvent(env, webhookPayload, partnerId);

    // 8. Cache idempotency result
    if (headers.idempotencyKey && result.referralId) {
      await cacheIdempotencyResult(
        env,
        headers.idempotencyKey,
        payload,
        result.referralId,
      );
    }

    return result;
  } catch (error) {
    const err = handleError(error, {
      component: "webhook",
      handler: "handleIncomingWebhook",
      partner_id: partnerId,
    });
    return {
      success: false,
      statusCode: 500,
      message: "Internal error processing webhook",
      error: err.message,
    };
  }
}

// ============================================================================
// Event Processing
// ============================================================================

async function processWebhookEvent(
  env: Env,
  payload: IncomingWebhookPayload,
  partnerId: string,
): Promise<IncomingWebhookResult> {
  switch (payload.event) {
    case "referral.created":
    case "referral.updated":
      return await processReferralCreatedOrUpdated(
        env,
        payload.data,
        partnerId,
      );
    case "referral.deactivated":
      return await processReferralDeactivated(env, payload.data);
    case "referral.expired":
      return await processReferralExpired(env, payload.data);
    case "ping":
      return { success: true, statusCode: 200, message: "Pong" };
    default:
      return {
        success: false,
        statusCode: 400,
        message: "Unknown event type",
        error: `Cannot process event: ${payload.event}`,
      };
  }
}

async function processReferralCreatedOrUpdated(
  env: Env,
  data: ReferralWebhookData,
  partnerId: string,
): Promise<IncomingWebhookResult> {
  // Validate required fields
  if (!data.code || !data.url || !data.domain) {
    return {
      success: false,
      statusCode: 400,
      message: "Missing required fields",
      error: "Required: code, url, domain",
    };
  }

  // Verify URL is complete (CRITICAL: URL Preservation Rule)
  try {
    const urlObj = new URL(data.url);
    if (!urlObj.protocol || !urlObj.host) throw new Error("Invalid URL");
  } catch {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid URL",
      error: "URL must be complete with protocol (e.g., https://)",
    };
  }

  // Check if referral already exists
  const existing = await getReferralByCode(env, data.code);
  const now = new Date().toISOString();

  if (
    existing &&
    data.code === existing.code &&
    data.domain === existing.domain
  ) {
    logger.info(`Updating existing referral from webhook: ${data.code}`, {
      component: "webhook",
      partner_id: partnerId,
    });
    return {
      success: true,
      statusCode: 200,
      message: "Referral already exists - no changes made",
      referralId: existing.id,
    };
  }

  // Create new referral
  const id = await generateDealId("webhook", data.code, "referral");
  const referral: ReferralInput = {
    id,
    code: data.code,
    url: data.url,
    domain: data.domain,
    source: "api",
    status: data.status || "quarantined",
    submitted_at: now,
    submitted_by: partnerId,
    expires_at: data.expires_at,
    metadata: {
      title: data.title || `${data.domain} Referral`,
      description: data.description || `Referral code for ${data.domain}`,
      reward_type: data.reward?.type || "unknown",
      reward_value: data.reward?.value,
      currency: data.reward?.currency,
      category: (data.metadata?.category as string[]) || ["general"],
      tags: [
        "webhook",
        `partner:${partnerId}`,
        ...((data.metadata?.tags as string[]) || []),
      ],
      requirements: [],
      confidence_score: 0.7,
      notes: `Received via webhook from ${partnerId}`,
    },
  };

  await storeReferralInput(env, referral);

  logger.info(`Referral created from webhook: ${referral.code}`, {
    component: "webhook",
    partner_id: partnerId,
    referral_id: referral.id,
    url: referral.url,
  });

  // Trigger outgoing webhooks
  await sendOutgoingWebhooks(env, {
    id: `evt_${generateId()}`,
    type: "referral.created",
    timestamp: now,
    data: {
      id: referral.id,
      code: referral.code,
      url: referral.url,
      domain: referral.domain,
      status: referral.status,
      source: "webhook",
      partner_id: partnerId,
    },
    metadata: {
      partner_id: partnerId,
      request_id: generateId(),
      trace_id: generateId(),
    },
  });

  return {
    success: true,
    statusCode: 201,
    message: "Referral created successfully",
    referralId: referral.id,
  };
}

async function processReferralDeactivated(
  env: Env,
  data: ReferralWebhookData,
): Promise<IncomingWebhookResult> {
  if (!data.code) {
    return {
      success: false,
      statusCode: 400,
      message: "Missing code",
      error: "Code is required for deactivation",
    };
  }

  const referral = await deactivateReferral(env, data.code, "user_request");

  if (!referral) {
    return {
      success: false,
      statusCode: 404,
      message: "Referral not found",
      error: `No referral found with code: ${data.code}`,
    };
  }

  return {
    success: true,
    statusCode: 200,
    message: "Referral deactivated",
    referralId: referral.id,
  };
}

async function processReferralExpired(
  env: Env,
  data: ReferralWebhookData,
): Promise<IncomingWebhookResult> {
  if (!data.code) {
    return {
      success: false,
      statusCode: 400,
      message: "Missing code",
      error: "Code is required for expiration",
    };
  }

  const referral = await deactivateReferral(env, data.code, "expired");

  if (!referral) {
    return {
      success: false,
      statusCode: 404,
      message: "Referral not found",
      error: `No referral found with code: ${data.code}`,
    };
  }

  return {
    success: true,
    statusCode: 200,
    message: "Referral marked as expired",
    referralId: referral.id,
  };
}

// ============================================================================
// Rate Limiting & Idempotency
// ============================================================================

async function checkRateLimit(
  env: Env,
  partnerId: string,
  limitPerMinute: number,
): Promise<RateLimitResult> {
  const kv = getWebhookKV(env);
  if (!kv) return { allowed: true };

  const key = `webhook_ratelimit:${partnerId}`;
  const now = Date.now();
  const windowStart = Math.floor(now / 60000) * 60000;

  const stored = await kv.get(key);
  let count = 0;

  if (stored) {
    const data = JSON.parse(stored) as { count: number; window: number };
    if (data.window === windowStart) count = data.count;
  }

  if (count >= limitPerMinute) {
    return {
      allowed: false,
      retryAfter: Math.ceil((windowStart + 60000 - now) / 1000),
    };
  }

  await kv.put(key, JSON.stringify({ count: count + 1, window: windowStart }), {
    expirationTtl: 120,
  });
  return { allowed: true };
}

async function checkIdempotency(
  env: Env,
  key: string,
  payload: string,
): Promise<IdempotencyCheck> {
  const kv = getWebhookKV(env);
  if (!kv) return { cached: false };

  const hashedKey = await hashIdempotencyKey(key);
  const stored = await kv.get(`idempotency:${hashedKey}`);

  if (!stored) return { cached: false };

  const record = JSON.parse(stored) as IdempotencyRecord;
  const now = new Date().toISOString();

  if (now > record.expires_at) return { cached: false };

  const payloadHash = await hashRequest("POST", "/webhook", payload);
  if (record.payload_hash !== payloadHash) {
    throw new Error("Idempotency key conflict: different payload");
  }

  return { cached: true, referralId: record.referral_id };
}

async function cacheIdempotencyResult(
  env: Env,
  key: string,
  payload: string,
  referralId: string,
): Promise<void> {
  const kv = getWebhookKV(env);
  if (!kv) return;

  const hashedKey = await hashIdempotencyKey(key);
  const payloadHash = await hashRequest("POST", "/webhook", payload);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const record: IdempotencyRecord = {
    key: hashedKey,
    payload_hash: payloadHash,
    referral_id: referralId,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  await kv.put(`idempotency:${hashedKey}`, JSON.stringify(record), {
    expirationTtl: 24 * 60 * 60,
  });
}
