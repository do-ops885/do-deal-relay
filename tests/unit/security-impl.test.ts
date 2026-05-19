import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateFetchUrl } from "../../worker/lib/security";
import { CONFIG } from "../../worker/config";

describe("Security Utils - validateFetchUrl", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Mock global fetch for DNS resolution
    global.fetch = vi.fn();
  });

  it("should allow safe HTTPS URLs", async () => {
    const url = "https://example.com/api/data";

    // Mock DNS resolution to return a public IP
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Answer: [{ data: "93.184.216.34" }], // example.com
      }),
    });

    const result = await validateFetchUrl(url);
    expect(result).toBe(true);
  });

  it("should block non-HTTPS protocols", async () => {
    const url = "http://example.com/api/data";
    const result = await validateFetchUrl(url);
    expect(result).toBe(false);
  });

  it("should block prohibited hosts from CONFIG", async () => {
    const url = `https://${CONFIG.BLOCKED_HOSTS[0]}/metadata`;
    const result = await validateFetchUrl(url);
    expect(result).toBe(false);
  });

  it("should block private IPv4 literals", async () => {
    const privateUrls = [
      "https://127.0.0.1/admin",
      "https://10.0.0.1/config",
      "https://172.16.0.1/setup",
      "https://192.168.1.1/router",
      "https://169.254.169.254/metadata",
    ];

    for (const url of privateUrls) {
      const result = await validateFetchUrl(url);
      expect(result).toBe(false, `Should have blocked ${url}`);
    }
  });

  it("should block IPv6 loopback", async () => {
    const url = "https://[::1]/";
    const result = await validateFetchUrl(url);
    expect(result).toBe(false);
  });

  it("should block hosts that resolve to private IPs (DNS Rebinding protection)", async () => {
    const url = "https://malicious.com/";

    // Mock DNS resolution to return a private IP
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Answer: [{ data: "10.0.0.5" }],
      }),
    });

    const result = await validateFetchUrl(url);
    expect(result).toBe(false);
  });

  it("should return false if DNS resolution fails", async () => {
    const url = "https://nonexistent-domain-xyz.com/";

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ Answer: [] }),
    });

    const result = await validateFetchUrl(url);
    expect(result).toBe(false);
  });

  it("should return false on fetch error during DNS resolution", async () => {
    const url = "https://example.com/";

    (global.fetch as any).mockRejectedValueOnce(new Error("Network timeout"));

    const result = await validateFetchUrl(url);
    expect(result).toBe(false);
  });
});
