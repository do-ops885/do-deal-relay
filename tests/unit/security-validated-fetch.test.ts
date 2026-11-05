import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isTrustedEgressUrl,
  parseTrustedEgressHosts,
  validateFetchUrl,
  validatedFetch,
} from "../../worker/lib/security";

const DOH_LOOKUPS_PER_RESOLUTION = 2;
const ORIGIN_FETCHES_PER_REQUEST = 1;
const PUBLIC_PROBE_IP = "93.184.216.34";
const FIRST_RESPONSE_MARKER = "first";
const SECOND_RESPONSE_MARKER = "second";
const CACHED_HOST_URL = "https://dns-cache-probe.example/resource";

function dohResponse(answerData: Array<{ data: string }>): Response {
  return new Response(JSON.stringify({ Answer: answerData }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function okTextResponse(bodyText: string): Response {
  return new Response(bodyText, { status: 200 });
}

describe("Security Utils - validatedFetch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  it("should throw if validateFetchUrl fails (SSRF protection)", async () => {
    const privateUrl = "https://127.0.0.1/admin";

    await expect(
      validatedFetch(privateUrl, undefined, new Set(["127.0.0.1"])),
    ).rejects.toThrow("SSRF Blocked: URL failed security validation");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("should succeed if validateFetchUrl passes", async () => {
    const publicUrl = "https://example.com/api";

    // Mock DNS resolution in validateFetchUrl (calls fetch for A and AAAA)
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(dohResponse([{ data: "93.184.216.34" }]))
      .mockResolvedValueOnce(dohResponse([]))
      .mockResolvedValueOnce(okTextResponse("success"));

    const response = await validatedFetch(
      publicUrl,
      undefined,
      parseTrustedEgressHosts("example.com"),
    );
    expect(response.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(3); // 2 for DNS (A and AAAA), 1 for actual fetch
  });

  it("should fail closed when a public hostname is outside the trusted egress policy", async () => {
    const publicUrl = "https://untrusted.example/api";

    await expect(
      validatedFetch(publicUrl, undefined, parseTrustedEgressHosts("")),
    ).rejects.toThrow("destination host is not trusted");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("should reject wildcard and IP entries in the trusted egress policy", () => {
    expect(() => parseTrustedEgressHosts("*.example.com")).toThrow(
      "exact DNS hostnames",
    );
    expect(() => parseTrustedEgressHosts("127.0.0.1")).toThrow(
      "exact DNS hostnames",
    );
  });

  it("should match only exact normalized trusted hostnames", () => {
    const trustedHosts = parseTrustedEgressHosts(
      "Example.com.,api.example.org",
    );

    expect(isTrustedEgressUrl("https://example.com/hook", trustedHosts)).toBe(
      true,
    );
    expect(
      isTrustedEgressUrl("https://sub.example.com/hook", trustedHosts),
    ).toBe(false);
  });

  it.each([
    ["IPv4 loopback", "https://127.0.0.1/admin"],
    ["IPv6 loopback", "https://[::1]/admin"],
    ["IPv4-mapped IPv6 loopback", "https://[::ffff:7f00:1]/admin"],
    ["metadata hostname", "https://metadata.google.internal/"],
  ])("should reject %s before connecting", async (_label, url) => {
    await expect(validateFetchUrl(url)).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("should reject redirects to hosts outside the trusted egress policy", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(dohResponse([{ data: PUBLIC_PROBE_IP }]))
      .mockResolvedValueOnce(dohResponse([]))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://untrusted.example/next" },
        }),
      );

    await expect(
      validatedFetch(
        "https://redirect-policy-probe.example/start",
        undefined,
        parseTrustedEgressHosts("redirect-policy-probe.example"),
      ),
    ).rejects.toThrow("redirect target is not trusted");
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("should skip DoH lookups when the host was resolved moments earlier", async () => {
    // Isolated mock so call counts measure this request pair only.
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock
      .mockResolvedValueOnce(dohResponse([{ data: PUBLIC_PROBE_IP }]))
      .mockResolvedValueOnce(dohResponse([]))
      .mockResolvedValueOnce(okTextResponse(FIRST_RESPONSE_MARKER))
      .mockResolvedValueOnce(okTextResponse(SECOND_RESPONSE_MARKER));

    const fullRunCalls =
      DOH_LOOKUPS_PER_RESOLUTION + ORIGIN_FETCHES_PER_REQUEST;

    const trustedHosts = parseTrustedEgressHosts("dns-cache-probe.example");
    await validatedFetch(CACHED_HOST_URL, undefined, trustedHosts);
    expect(fetchMock.mock.calls.length).toBe(fullRunCalls);

    const secondResponse = await validatedFetch(
      CACHED_HOST_URL,
      undefined,
      trustedHosts,
    );

    // Cached run adds only the origin fetch: zero DoH subrequests spent.
    expect(fetchMock.mock.calls.length).toBe(
      fullRunCalls + ORIGIN_FETCHES_PER_REQUEST,
    );
    expect(await secondResponse.text()).toBe(SECOND_RESPONSE_MARKER);
  });
});
