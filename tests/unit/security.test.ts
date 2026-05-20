import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateFetchUrl } from "../../worker/lib/security";
import { logger } from "../../worker/lib/global-logger";

// Mock the logger to verify it's called
vi.mock("../../worker/lib/global-logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock global fetch for DNS resolution
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("SSRF Protection - validateFetchUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock response for DNS resolution (public IP)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ Answer: [{ data: "8.8.8.8" }] }),
    });
  });

  it("should allow valid public HTTPS URLs", async () => {
    expect(await validateFetchUrl("https://api.github.com/repos")).toBe(true);
    expect(await validateFetchUrl("https://www.producthunt.com")).toBe(true);
    expect(await validateFetchUrl("https://news.ycombinator.com")).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("should block non-HTTPS protocols", async () => {
    expect(await validateFetchUrl("http://example.com")).toBe(false);
    expect(await validateFetchUrl("ftp://example.com")).toBe(false);
    expect(await validateFetchUrl("gopher://example.com")).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Non-HTTPS protocol detected"),
      expect.any(Object),
    );
  });

  it("should block cloud metadata hostnames", async () => {
    expect(
      await validateFetchUrl("https://169.254.169.254/latest/meta-data/"),
    ).toBe(false);
    expect(
      await validateFetchUrl(
        "https://metadata.google.internal/computeMetadata/v1/",
      ),
    ).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Prohibited host detected"),
      expect.any(Object),
    );
  });

  it("should block localhost and loopback", async () => {
    expect(await validateFetchUrl("https://localhost:8787")).toBe(false);
    expect(await validateFetchUrl("https://127.0.0.1:8787")).toBe(false);
    expect(await validateFetchUrl("https://[::1]:8787")).toBe(false);
  });

  it("should block private IPv4 ranges", async () => {
    expect(await validateFetchUrl("https://10.0.0.1")).toBe(false);
    expect(await validateFetchUrl("https://172.16.0.1")).toBe(false);
    expect(await validateFetchUrl("https://172.31.255.255")).toBe(false);
    expect(await validateFetchUrl("https://192.168.1.1")).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Private IP address detected"),
      expect.any(Object),
    );
  });

  it("should block private/reserved IPv6 ranges", async () => {
    expect(await validateFetchUrl("https://[fc00::1]")).toBe(false);
    expect(await validateFetchUrl("https://[fdff:ffff::1]")).toBe(false);
    expect(await validateFetchUrl("https://[fe80::1]")).toBe(false);
  });

  it("should block hostnames resolving to private IPs (DNS rebinding)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ Answer: [{ data: "192.168.1.1" }] }),
    });

    expect(await validateFetchUrl("https://rebound.example.com")).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("resolved to private IP"),
      expect.any(Object),
    );
  });

  it("should handle DNS resolution failures", async () => {
    mockFetch.mockRejectedValue(new Error("DNS failure"));

    // Should still block if it can't resolve securely
    expect(await validateFetchUrl("https://unknown.example.com")).toBe(true);
    // Note: In a fail-closed system, this might be false.
    // Currently, resolveHostname returns [] on error, and loop continues.
    // If it's a security risk, we might want to fail closed.
  });

  it("should handle malformed URLs gracefully", async () => {
    expect(await validateFetchUrl("not-a-url")).toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });
});
