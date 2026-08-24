import { describe, it, expect, vi, beforeEach } from "vitest";
import { validatedFetch } from "../../worker/lib/security";

const DOH_LOOKUPS_PER_RESOLUTION = 2;
const ORIGIN_FETCHES_PER_REQUEST = 1;
const PUBLIC_PROBE_IP = "93.184.216.34";
const FIRST_RESPONSE_MARKER = "first";
const SECOND_RESPONSE_MARKER = "second";
const CACHED_HOST_URL = "https://dns-cache-probe.example/resource";

function dohResponse(answerData: Array<{ data: string }>) {
  return {
    ok: true,
    json: async () => ({ Answer: answerData }),
  };
}

function okTextResponse(bodyText: string) {
  return {
    ok: true,
    status: 200,
    text: async () => bodyText,
  };
}

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

    await validatedFetch(CACHED_HOST_URL);
    expect(fetchMock.mock.calls.length).toBe(fullRunCalls);

    const secondResponse = await validatedFetch(CACHED_HOST_URL);

    // Cached run adds only the origin fetch: zero DoH subrequests spent.
    expect(fetchMock.mock.calls.length).toBe(
      fullRunCalls + ORIGIN_FETCHES_PER_REQUEST,
    );
    expect(await secondResponse.text()).toBe(SECOND_RESPONSE_MARKER);
  });
});
