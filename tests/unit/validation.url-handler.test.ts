import { describe, it, expect, vi } from "vitest";
import { handleValidateUrl } from "../../worker/routes/validation/url";
import * as security from "../../worker/lib/security";
import type { Env } from "../../worker/types";

describe("handleValidateUrl error sanitization", () => {
  it("should sanitize exceptions and not leak raw internal error details to client", async () => {
    // Mock validateFetchUrl to throw an unexpected internal error (e.g. DoH/DNS failure or internal exception)
    vi.spyOn(security, "validateFetchUrl").mockRejectedValue(
      new Error("Internal DoH resolution failure: connection reset by peer"),
    );

    const request = new Request("https://example.com/api/validate/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/test" }),
    });

    const mockEnv = {
      RATE_LIMIT_KV: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Env;

    const response = await handleValidateUrl(request, mockEnv);

    expect(response.status).toBe(500);

    const body = (await response.json()) as {
      error: string;
      details?: unknown;
    };
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeUndefined();

    vi.restoreAllMocks();
  });
});
