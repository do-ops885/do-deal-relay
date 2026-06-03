import { describe, it, expect } from "vitest";
import {
  createToken,
  verifyToken,
  hashPassword,
  verifyPassword,
} from "../../worker/lib/jwt";

describe("JWT Utilities", () => {
  const secret = process.env.JWT_SECRET || "test-secret-key-for-jwt-testing";
  const payload = { sub: "user123", role: "admin" };

  it("should create and verify a valid JWT token", async () => {
    const token = await createToken(payload, secret, 3600);
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);

    const decoded = await verifyToken(token, secret);
    expect(decoded).not.toBeNull();
    expect(decoded!.sub).toBe("user123");
    expect(decoded!.role).toBe("admin");
  });

  it("should reject token with wrong secret", async () => {
    const token = await createToken(payload, secret, 3600);
    const decoded = await verifyToken(token, "wrong-secret");
    expect(decoded).toBeNull();
  });

  it("should reject tampered token", async () => {
    const token = await createToken(payload, secret, 3600);
    const parts = token.split(".");
    const tamperedToken = parts[0] + "." + parts[1] + ".invalidsignature";
    const decoded = await verifyToken(tamperedToken, secret);
    expect(decoded).toBeNull();
  });

  it("should hash and verify passwords", async () => {
    const password = process.env.TEST_PASSWORD || "my-secure-password-123!";
    const hash = await hashPassword(password);
    expect(hash).toBeDefined();
    expect(hash.includes(".")).toBe(true);

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  it("should reject wrong password", async () => {
    const hash = await hashPassword("correct-password");
    const isValid = await verifyPassword("wrong-password", hash);
    expect(isValid).toBe(false);
  });
});

describe("RBAC Authorization", () => {
  it("should enforce role hierarchy", async () => {
    const { authorize, hasPermission } =
      await import("../../worker/middleware/authorization");
    expect(hasPermission("admin", "viewer")).toBe(true);
    expect(hasPermission("user", "admin")).toBe(false);
    expect(hasPermission("viewer", "user")).toBe(false);
    expect(hasPermission("admin", "admin")).toBe(true);
    expect(hasPermission("api_consumer", "viewer")).toBe(false);
  });

  it("should return middleware function from authorize", async () => {
    const { authorize } = await import("../../worker/middleware/authorization");
    const middleware = authorize("admin");
    expect(middleware).toBeDefined();
    expect(typeof middleware).toBe("function");
  });
});
