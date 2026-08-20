import { describe, it, expect } from "vitest";
import {
  generateHmacSignature,
  verifyHmacSignature,
  timingSafeEqual,
  parseSignatureHeader,
  generateWebhookHeaders,
  generateWebhookSecret,
  hashIdempotencyKey,
  hashRequest,
} from "../../worker/lib/hmac";

describe("HMAC Security Utilities", () => {
  const secret = "whsec_testsecret1234567890abcdef";
  const payload = JSON.stringify({
    event: "referral.created",
    code: "TEST123",
  });
  const timestamp = Math.floor(Date.now() / 1000);

  describe("generateHmacSignature", () => {
    it("should generate a valid hex string signature", async () => {
      const sig = await generateHmacSignature(payload, secret, timestamp);
      expect(sig).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should generate different signatures for different payloads", async () => {
      const sig1 = await generateHmacSignature(payload, secret, timestamp);
      const sig2 = await generateHmacSignature("different", secret, timestamp);
      expect(sig1).not.toBe(sig2);
    });
  });

  describe("verifyHmacSignature", () => {
    it("should verify valid signature within timestamp tolerance", async () => {
      const sig = await generateHmacSignature(payload, secret, timestamp);
      const result = await verifyHmacSignature(payload, sig, secret, timestamp);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject invalid signature without leaking computed signature", async () => {
      const result = await verifyHmacSignature(
        payload,
        "0000000000000000000000000000000000000000000000000000000000000000",
        secret,
        timestamp,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid signature");
      // Security assertion: computed signature must NOT be leaked
      expect(
        (result as unknown as Record<string, unknown>).computedSignature,
      ).toBeUndefined();
    });

    it("should reject expired timestamps to prevent replay attacks", async () => {
      const oldTimestamp = timestamp - 600; // 10 minutes ago
      const sig = await generateHmacSignature(payload, secret, oldTimestamp);
      const result = await verifyHmacSignature(
        payload,
        sig,
        secret,
        oldTimestamp,
        300, // 5 min tolerance
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Webhook timestamp too old");
    });
  });

  describe("timingSafeEqual", () => {
    it("should return true for identical strings", () => {
      expect(timingSafeEqual("abc123def", "abc123def")).toBe(true);
    });

    it("should return false for strings of different length", () => {
      expect(timingSafeEqual("abc", "abcd")).toBe(false);
    });

    it("should return false for different strings of same length", () => {
      expect(timingSafeEqual("abc123def", "abc123deg")).toBe(false);
    });
  });

  describe("parseSignatureHeader", () => {
    it("should parse valid signature header", () => {
      const parsed = parseSignatureHeader("sha256=1234567890abcdef");
      expect(parsed).toEqual({
        algorithm: "sha256",
        signature: "1234567890abcdef",
      });
    });

    it("should return null for invalid formats", () => {
      expect(parseSignatureHeader("sha1=123456")).toBeNull();
      expect(parseSignatureHeader("invalid_header")).toBeNull();
      expect(parseSignatureHeader("sha256=")).toEqual({
        algorithm: "sha256",
        signature: "",
      });
    });
  });

  describe("generateWebhookHeaders", () => {
    it("should generate expected webhook headers including signature", async () => {
      const headers = await generateWebhookHeaders(
        payload,
        secret,
        "evt_123",
        "referral.created",
      );
      expect(headers["X-Webhook-Id"]).toBe("evt_123");
      expect(headers["X-Webhook-Event-Type"]).toBe("referral.created");
      expect(headers["X-Webhook-Signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
      expect(headers["X-Webhook-Timestamp"]).toBeDefined();
    });
  });

  describe("generateWebhookSecret", () => {
    it("should generate a secure secret with prefix", () => {
      const secret1 = generateWebhookSecret();
      const secret2 = generateWebhookSecret();
      expect(secret1).toMatch(/^whsec_[a-f0-9]{64}$/);
      expect(secret1).not.toBe(secret2);
    });
  });

  describe("hashIdempotencyKey and hashRequest", () => {
    it("should hash idempotency key consistently", async () => {
      const hash1 = await hashIdempotencyKey("idem_key_1");
      const hash2 = await hashIdempotencyKey("idem_key_1");
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should hash request parameters consistently", async () => {
      const hash1 = await hashRequest("POST", "/webhook", payload);
      const hash2 = await hashRequest("POST", "/webhook", payload);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
