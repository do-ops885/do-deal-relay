import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateFetchUrl } from "../../worker/lib/security";

describe("Security Utils - validateFetchUrl SSRF Bypass Prevention", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  it("should block IPv4-mapped IPv6 addresses pointing to private/loopback", async () => {
    const mappedUrls = [
      "https://[::ffff:127.0.0.1]/",
      "https://[::ffff:7f00:1]/",
      "https://[0:0:0:0:0:ffff:127.0.0.1]/",
      "https://[::ffff:192.168.1.1]/",
    ];

    for (const url of mappedUrls) {
      const result = await validateFetchUrl(url);
      expect(result).toBe(false);
    }
  });

  it("should still block standard private IPv6 addresses", async () => {
    const privateIpv6 = [
      "https://[::1]/",
      "https://[fc00::1]/",
      "https://[fe80::1]/",
    ];

    for (const url of privateIpv6) {
      const result = await validateFetchUrl(url);
      expect(result).toBe(false);
    }
  });

  it("should allow public IPv6 addresses", async () => {
    // Mock DNS resolution to return a public IPv6
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        Answer: [{ data: "2606:4700:4700::1111" }],
      }),
    });

    const result = await validateFetchUrl("https://one.one.one.one/");
    expect(result).toBe(true);
  });

  it("should block domains that resolve to private IPv6 addresses", async () => {
    // Mock DNS resolution: A record empty, AAAA record returns private IPv6
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Answer: [] }), // A record
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Answer: [{ data: "fc00::1" }], // AAAA record
        }),
      });

    const result = await validateFetchUrl("https://private-ipv6.com/");
    expect(result).toBe(false);
  });
});
