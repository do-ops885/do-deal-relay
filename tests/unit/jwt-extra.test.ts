import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  hashRefreshToken,
  generateTokenFamily,
} from "../../worker/lib/jwt";

describe("JWT Utilities Extra", () => {
  describe("hashPassword and verifyPassword", () => {
    it("should hash and verify a password correctly", async () => {
      const password = "test-password";
      const hash = await hashPassword(password);
      expect(hash).toContain(".");
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it("should return false for incorrect password", async () => {
      const password = "test-password";
      const hash = await hashPassword(password);
      const isValid = await verifyPassword("wrong-password", hash);
      expect(isValid).toBe(false);
    });

    it("should return false for malformed hash", async () => {
      const isValid = await verifyPassword("password", "invalidhash");
      expect(isValid).toBe(false);
    });
  });

  describe("hashRefreshToken", () => {
    it("should return a hashed token with a salt", async () => {
      const token = "refresh-token-123";
      const hash = await hashRefreshToken(token);
      expect(hash).toContain(".");
    });
  });

  describe("generateTokenFamily", () => {
    it("should generate a 32-character hex string", () => {
      const familyId = generateTokenFamily();
      expect(familyId).toMatch(/^[a-f0-9]{32}$/);
    });

    it("should generate unique identifiers", () => {
      const id1 = generateTokenFamily();
      const id2 = generateTokenFamily();
      expect(id1).not.toBe(id2);
    });
  });
});
