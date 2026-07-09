import { describe, it, expect, vi, beforeEach } from "vitest";
import { validatedFetch } from "../../worker/lib/security";

describe("Security Utils - validatedFetch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  it("should throw if validateFetchUrl fails (SSRF protection)", async () => {
    const privateUrl = "https://127.0.0.1/admin";

    await expect(validatedFetch(privateUrl)).rejects.toThrow(
      "SSRF Blocked: URL failed security validation",
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("should succeed if validateFetchUrl passes", async () => {
    const publicUrl = "https://example.com/api";

    // Mock DNS resolution in validateFetchUrl (calls fetch for A and AAAA)
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Answer: [{ data: "93.184.216.34" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Answer: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "success",
      });

    const response = await validatedFetch(publicUrl);
    expect(response.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(3); // 2 for DNS (A and AAAA), 1 for actual fetch
  });
});
