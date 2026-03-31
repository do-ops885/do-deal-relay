import { describe, it, expect, beforeEach } from "vitest";
import {
  sha256,
  generateDealId,
  generateSnapshotHash,
  generateUUID,
  calculateStringSimilarity,
  calculateUrlSimilarity,
} from "../../worker/lib/crypto";

describe("Crypto Utilities", () => {
  describe("sha256", () => {
    it("should generate consistent hashes", async () => {
      const hash1 = await sha256("test");
      const hash2 = await sha256("test");
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it("should generate different hashes for different inputs", async () => {
      const hash1 = await sha256("test1");
      const hash2 = await sha256("test2");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("generateDealId", () => {
    it("should generate consistent IDs", async () => {
      const id1 = await generateDealId("example.com", "CODE123", "cash");
      const id2 = await generateDealId("example.com", "CODE123", "cash");
      expect(id1).toBe(id2);
    });

    it("should normalize input", async () => {
      const id1 = await generateDealId("EXAMPLE.COM", "code123", "cash");
      const id2 = await generateDealId("example.com", "CODE123", "cash");
      expect(id1).toBe(id2);
    });
  });

  describe("calculateStringSimilarity", () => {
    it("should return 1.0 for identical strings", () => {
      expect(calculateStringSimilarity("hello", "hello")).toBe(1.0);
    });

    it("should return 0.0 for completely different strings", () => {
      expect(calculateStringSimilarity("abc", "xyz")).toBe(0.0);
    });

    it("should return value between 0 and 1 for similar strings", () => {
      const similarity = calculateStringSimilarity("hello", "helo");
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });
  });

  describe("calculateUrlSimilarity", () => {
    it("should return 1.0 for identical URLs", () => {
      expect(
        calculateUrlSimilarity(
          "https://example.com/path",
          "https://example.com/path",
        ),
      ).toBe(1.0);
    });

    it("should return 0.0 for different domains", () => {
      expect(
        calculateUrlSimilarity("https://example.com", "https://other.com"),
      ).toBe(0.0);
    });
  });
});
