// tests/unit/validation-cache.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  ValidationCacheRepository,
  ttlForStatus,
} from "../../worker/lib/validation-cache/repository";

describe("ValidationCacheRepository", () => {
  it("writes TTL-backed entries", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const repo = new ValidationCacheRepository({
      get: vi.fn(),
      put,
    });

    const entry = {
      status: "accepted" as const,
      fingerprint: "fp1",
      normalizedUrl: "https://example.com/deal",
      createdAt: new Date().toISOString(),
    };

    await repo.put("v:url:test", entry, ttlForStatus("accepted"));

    expect(put).toHaveBeenCalledWith(
      "v:url:test",
      JSON.stringify(entry),
      expect.objectContaining({ expirationTtl: 60 * 60 * 24 }),
    );
  });

  it("uses shorter TTL for transient errors", () => {
    expect(ttlForStatus("transient_error")).toBe(60 * 15);
  });

  it("returns null for cache miss", async () => {
    const repo = new ValidationCacheRepository({
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn(),
    });

    const result = await repo.get("missing");
    expect(result).toBeNull();
  });
});
