// ============================================================================
// HMAC-SHA256 Signature Verification Utilities
// ============================================================================

export interface HmacConfig {
  secret: string;
  timestampToleranceSeconds: number;
}

export interface SignatureResult {
  valid: boolean;
  error?: string;
  computedSignature?: string;
}

/**
 * Generate HMAC-SHA256 signature for webhook payload
 * Format: HMAC-SHA256(timestamp.payload)
 *
 * @param payload - The string payload to sign
 * @param secret - The secret key for signing
 * @param timestamp - The Unix timestamp to include in the signature
 * @returns The hex-encoded HMAC signature
 */
export async function generateHmacSignature(
  payload: string,
  secret: string,
  timestamp: number,
): Promise<string> {
  const encoder = new TextEncoder();
  const signedPayload = `${timestamp}.${payload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signedPayload),
  );

  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify HMAC-SHA256 signature with timing-safe comparison
 * Includes timestamp validation to prevent replay attacks
 *
 * @param payload - The received payload string
 * @param signature - The signature to verify
 * @param secret - The secret key for verification
 * @param timestamp - The timestamp from the request
 * @param toleranceSeconds - Allowed time drift in seconds (default: 300)
 * @returns Verification result with potential error message
 */
export async function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string,
  timestamp: number,
  toleranceSeconds: number = 300, // 5 minutes default
): Promise<SignatureResult> {
  // 1. Validate timestamp (prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  const timeDiff = Math.abs(now - timestamp);

  if (timeDiff > toleranceSeconds) {
    return {
      valid: false,
      error: `Webhook timestamp too old. Difference: ${timeDiff}s, max allowed: ${toleranceSeconds}s`,
    };
  }

  // 2. Compute expected signature
  const expectedSignature = await generateHmacSignature(
    payload,
    secret,
    timestamp,
  );

  // 3. Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(expectedSignature, signature.toLowerCase())) {
    return {
      valid: false,
      error: "Invalid signature",
      computedSignature: expectedSignature,
    };
  }

  return { valid: true };
}

/**
 * Constant-time string comparison to prevent timing attacks
 *
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Parse webhook signature header
 * Format: sha256=<hex_signature>
 *
 * @param header - The Raw X-Webhook-Signature header value
 * @returns Parsed algorithm and signature, or null if invalid
 */
export function parseSignatureHeader(
  header: string,
): { algorithm: string; signature: string } | null {
  const parts = header.split("=");
  if (parts.length !== 2) {
    return null;
  }

  const [algorithm, signature] = parts;
  if (algorithm !== "sha256" || signature === undefined) {
    return null;
  }

  return { algorithm, signature };
}

/**
 * Generate webhook headers for outgoing requests
 *
 * @param payload - JSON string payload
 * @param secret - Webhook secret
 * @param eventId - Unique ID for the event
 * @param eventType - Type of webhook event
 * @returns Record of HTTP headers
 */
export async function generateWebhookHeaders(
  payload: string,
  secret: string,
  eventId: string,
  eventType: string,
): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await generateHmacSignature(payload, secret, timestamp);

  return {
    "Content-Type": "application/json",
    "X-Webhook-Signature": `sha256=${signature}`,
    "X-Webhook-Timestamp": timestamp.toString(),
    "X-Webhook-Id": eventId,
    "X-Webhook-Event-Type": eventType,
    "X-Webhook-Version": "1.0",
  };
}

/**
 * Generate a cryptographically secure webhook secret
 *
 * @returns A hex-encoded secret string prefixed with whsec_
 */
export function generateWebhookSecret(): string {
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
 * Hash an idempotency key for storage
 *
 * @param key - The raw idempotency key
 * @returns Hex-encoded SHA-256 hash
 */
export async function hashIdempotencyKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(key));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Hash request for idempotency check
 *
 * @param method - HTTP Method
 * @param path - Request Path
 * @param body - Request Body string
 * @returns Hex-encoded SHA-256 hash of the request components
 */
export async function hashRequest(
  method: string,
  path: string,
  body: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const data = `${method}:${path}:${body}`;
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(data),
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
