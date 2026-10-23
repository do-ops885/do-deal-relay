import { describe, it, expect, beforeEach } from "vitest";
import {
  handleCreateApiKey,
  DEFAULT_API_KEY_REQUESTS_PER_MINUTE,
  DEFAULT_API_KEY_REQUESTS_PER_HOUR,
} from "../../worker/routes/admin/keys";
import type { Env } from "../../worker/types";

describe("Admin API Keys - handleCreateApiKey security validation", () => {
  let mockKvStorage: Map<string, string>;
  let mockEnv: Env;

  beforeEach(() => {
    mockKvStorage = new Map<string, string>();
    const kvMock = {
      get: async (key: string) => mockKvStorage.get(key) || null,
      put: async (key: string, value: string) => {
        mockKvStorage.set(key, value);
      },
      delete: async (key: string) => {
        mockKvStorage.delete(key);
      },
      list: async () => ({ keys: [], list_complete: true }),
    };

    mockEnv = {
      WEBHOOK_API_KEYS: kvMock as any,
      DEALS_SOURCES: kvMock as any,
    } as Env;
  });

  it("should create API key for valid roles: admin, user, readonly", async () => {
    for (const role of ["admin", "user", "readonly"] as const) {
      const req = new Request("http://localhost/api/admin/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "usr_123", role }),
      });

      const res = await handleCreateApiKey(req, mockEnv);
      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);
      expect(data.apiKey).toMatch(/^ddr_/);
    }
  });

  it("should reject API key creation for invalid roles", async () => {
    const invalidRoles = ["superadmin", "owner", "root", "unknown_role"];

    for (const role of invalidRoles) {
      const req = new Request("http://localhost/api/admin/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "usr_123", role }),
      });

      const res = await handleCreateApiKey(req, mockEnv);
      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error).toContain("Invalid role");
    }
  });

  it("should assign default rate limits when rateLimit is omitted from request body", async () => {
    const req = new Request("http://localhost/api/admin/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "usr_default_rl", role: "user" }),
    });

    const res = await handleCreateApiKey(req, mockEnv);
    expect(res.status).toBe(201);

    // Verify stored key in KV contains default rate limits
    expect(mockKvStorage.size).toBe(1);
    const storedRecordRaw = Array.from(mockKvStorage.values())[0];
    expect(storedRecordRaw).toBeDefined();
    const storedRecord = JSON.parse(storedRecordRaw as string);

    expect(storedRecord.rateLimit).toEqual({
      requestsPerMinute: DEFAULT_API_KEY_REQUESTS_PER_MINUTE,
      requestsPerHour: DEFAULT_API_KEY_REQUESTS_PER_HOUR,
    });
  });

  it("should preserve custom rate limits when explicitly provided in request body", async () => {
    const customRateLimit = {
      requestsPerMinute: 120,
      requestsPerHour: 5000,
    };

    const req = new Request("http://localhost/api/admin/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "usr_custom_rl",
        role: "admin",
        rateLimit: customRateLimit,
      }),
    });

    const res = await handleCreateApiKey(req, mockEnv);
    expect(res.status).toBe(201);

    const storedRecordRaw = Array.from(mockKvStorage.values())[0];
    expect(storedRecordRaw).toBeDefined();
    const storedRecord = JSON.parse(storedRecordRaw as string);

    expect(storedRecord.rateLimit).toEqual(customRateLimit);
  });
});
