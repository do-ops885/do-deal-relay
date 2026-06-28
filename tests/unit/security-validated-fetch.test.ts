import { describe, it, expect, vi, beforeEach } from "vitest";
import { validatedFetch } from "../../worker/lib/security";

describe("Security Utils - validatedFetch hardening", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  it("should allow safe HTTPS URLs", async () => {
    // Mock fetch to handle both DNS resolution and the target request
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.startsWith("https://cloudflare-dns.com/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            Answer: [{ data: "1.1.1.1" }],
          }),
        });
      }
      if (url === "https://example.com") {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => "success",
        });
      }
      return Promise.reject(new Error("Unexpected fetch call"));
    });

    const response = await validatedFetch("https://example.com");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("success");
  });

  it("should block non-HTTPS URLs", async () => {
    // validateUrl allows http, but validateFetchUrl (SSRF protection) blocks it
    await expect(validatedFetch("http://example.com")).rejects.toThrow(
      "SSRF Blocked: URL is potentially dangerous",
    );
  });

  it("should block URLs pointing to private IPv4", async () => {
    await expect(validatedFetch("https://127.0.0.1")).rejects.toThrow(
      "SSRF Blocked: URL is potentially dangerous",
    );
  });

  it("should block URLs pointing to private IPv6", async () => {
    await expect(validatedFetch("https://[::1]")).rejects.toThrow(
      "SSRF Blocked: URL is potentially dangerous",
    );
  });

  it("should block prohibited hosts", async () => {
    await expect(
      validatedFetch("https://metadata.google.internal"),
    ).rejects.toThrow("SSRF Blocked: URL is potentially dangerous");
  });

  it("should block domains resolving to private IPs", async () => {
    // Mock DNS resolution to return a private IP
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.startsWith("https://cloudflare-dns.com/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            Answer: [{ data: "192.168.1.1" }],
          }),
        });
      }
      return Promise.reject(new Error("Unexpected fetch call"));
    });

    await expect(validatedFetch("https://private.local")).rejects.toThrow(
      "SSRF Blocked: URL is potentially dangerous",
    );
  });
});
