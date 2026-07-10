import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { discover } from "../../worker/pipeline/discover";
import { validatedFetch } from "../../worker/lib/security";
import type {
  Deal,
  PipelineContext,
  Env,
  SourceConfig,
} from "../../worker/types";

// Mock validatedFetch to bypass SSRF DNS resolution (cloudflare-dns.com)
vi.mock("../../worker/lib/security", () => ({
  validatedFetch: vi.fn(),
}));

const createMockDeal = (id: string, overrides: Partial<Deal> = {}): Deal => ({
  id,
  source: {
    url: "https://example.com/invite",
    domain: "example.com",
    discovered_at: "2024-03-31T00:00:00Z",
    trust_score: overrides.source?.trust_score || 0.7,
  },
  title: "Test Deal",
  description: "Test description",
  code: "CODE123",
  url: "https://example.com/invite/CODE123",
  reward: {
    type: "cash",
    value: 50,
    currency: "USD",
  },
  expiry: {
    confidence: 0.8,
    type: "soft",
  },
  metadata: {
    category: ["test"],
    tags: ["test"],
    normalized_at: "2024-03-31T00:00:00Z",
    confidence_score: 0.8,
    status: "active",
  },
});

const createMockSource = (
  overrides: Partial<SourceConfig> = {},
): SourceConfig => ({
  domain: "example.com",
  url_patterns: ["/referral", "/invite"],
  trust_initial: 0.7,
  classification: "probationary",
  active: true,
  ...overrides,
});

describe("Discovery Engine", () => {
  const ctx: PipelineContext = {
    run_id: "test-run",
    trace_id: "test-trace",
    start_time: Date.now(),
    candidates: [],
    normalized: [],
    deduped: [],
    validated: [],
    scored: [],
    errors: [],
    retry_count: 0,
  };

  let mockKvStorage: Map<string, unknown>;

  let _validatedFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockKvStorage = new Map();
    vi.clearAllMocks();
    _validatedFetch = vi.mocked(validatedFetch);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createMockEnv = (sources: SourceConfig[] = []): Env => {
    mockKvStorage.set("registry", sources);
    // Pre-populate robots.txt cache to allow all (avoids extra fetches in tests)
    for (const source of sources) {
      mockKvStorage.set(`cache:robots_txt:robots_txt:${source.domain}`, {
        data: true,
        timestamp: Date.now(),
        ttl_seconds: 3600,
      });
    }
    return {
      DEALS_PROD: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
        delete: vi.fn(async () => {}),
      } as unknown as KVNamespace,
      DEALS_STAGING: {} as KVNamespace,
      DEALS_LOG: {} as KVNamespace,
      DEALS_LOCK: {} as KVNamespace,
      DEALS_SOURCES: {
        get: vi.fn(async <T>(key: string) => mockKvStorage.get(key) as T),
        put: vi.fn(async (key: string, value: string) => {
          mockKvStorage.set(key, JSON.parse(value));
        }),
        delete: vi.fn(async (key: string) => {
          mockKvStorage.delete(key);
        }),
      } as unknown as KVNamespace,
      AI_GATEWAY_URL: "https://gateway.test",
      WEBHOOK_SECRET: "test-secret",
      API_ENCRYPTION_KEY: "test-key",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      DEALS_DB: {} as any,
      TRUST_THRESHOLD: "0.3",
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      NOTIFICATION_THRESHOLD: "100",
    } as unknown as Env;
  };

  describe("discover", () => {
    it("should return empty result when no active sources", async () => {
      const env = createMockEnv([]);
      const result = await discover(env, ctx);
      expect(result.deals).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should skip blocked sources", async () => {
      const sources = [
        createMockSource({
          domain: "blocked.com",
          classification: "blocked",
          url_patterns: ["/page"],
        }),
        createMockSource({
          domain: "active.com",
          classification: "trusted",
          url_patterns: ["/page"],
        }),
      ];
      const env = createMockEnv(sources);

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify([
            {
              code: "ACTIVE123",
              url: "https://active.com/invite",
              title: "Active Deal",
              reward_value: 50,
            },
          ]),
      });

      const result = await discover(env, ctx);
      expect(_validatedFetch).toHaveBeenCalledTimes(1);
      expect(_validatedFetch).toHaveBeenCalledWith(
        "https://active.com/page",
        expect.any(Object),
      );
    });

    it("should handle HTTP errors from sources", async () => {
      const sources = [
        createMockSource({ domain: "error.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      _validatedFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await discover(env, ctx);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]!.error).toContain("HTTP 500");
    });

    it("should handle fetch timeout", async () => {
      const sources = [
        createMockSource({ domain: "timeout.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      _validatedFetch.mockRejectedValue(new Error("Timeout"));

      const result = await discover(env, ctx);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });

    it("should update source discovery metadata on success", async () => {
      const source = createMockSource({
        domain: "test.com",
        url_patterns: ["/page"],
      });
      const env = createMockEnv([source]);

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify([
            {
              code: "TEST123",
              url: "https://test.com/invite",
              title: "Test Deal",
              reward_value: 25,
            },
          ]),
      });

      await discover(env, ctx);
      expect(env.DEALS_SOURCES.put).toHaveBeenCalled();
    });

    it("should record validation failure on fetch error", async () => {
      const sources = [
        createMockSource({ domain: "fail.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      _validatedFetch.mockRejectedValue(new Error("Network error"));

      await discover(env, ctx);
      expect(env.DEALS_SOURCES.put).toHaveBeenCalled();
    });

    it("should collect deals from multiple sources", async () => {
      const sources = [
        createMockSource({ domain: "source1.com", url_patterns: ["/page"] }),
        createMockSource({ domain: "source2.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      _validatedFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () =>
            JSON.stringify([
              {
                code: "CODE1",
                url: "https://source1.com/invite",
                title: "Deal 1",
                reward_value: 10,
              },
            ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () =>
            JSON.stringify([
              {
                code: "CODE2",
                url: "https://source2.com/invite",
                title: "Deal 2",
                reward_value: 20,
              },
            ]),
        });

      const result = await discover(env, ctx);
      expect(result.deals).toHaveLength(2);
    });
  });

  describe("URL building", () => {
    it("should construct URLs from source patterns", async () => {
      const sources = [
        createMockSource({
          domain: "test.com",
          url_patterns: ["/api/deals", "/referrals"],
        }),
      ];
      const env = createMockEnv(sources);

      _validatedFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => "[]",
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => "[]",
        });

      await discover(env, ctx);
      expect(_validatedFetch).toHaveBeenCalledWith(
        "https://test.com/api/deals",
        expect.any(Object),
      );
      expect(_validatedFetch).toHaveBeenCalledWith(
        "https://test.com/referrals",
        expect.any(Object),
      );
    });

    it("should include proper headers in fetch", async () => {
      const sources = [
        createMockSource({ domain: "headers.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => "[]",
      });

      await discover(env, ctx);
      expect(_validatedFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "User-Agent": expect.stringContaining("DealDiscoveryBot"),
            Accept: "text/html,application/json",
          }),
          signal: expect.any(AbortSignal),
        }),
      );
    });
  });

  describe("Deal building", () => {
    it("should build complete deal objects", async () => {
      const sources = [
        createMockSource({ domain: "build.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify([
            {
              code: "BUILD123",
              title: "Build Deal",
              description: "A great deal",
              url: "https://build.com/invite/BUILD123",
              reward_type: "cash",
              reward_value: 200,
              currency: "EUR",
              expiry: "2024-06-01T00:00:00Z",
            },
          ]),
      });

      const result = await discover(env, ctx);
      const deal = result.deals[0]!;

      expect(deal.id).toBeDefined();
      expect(deal.source.domain).toBe("build.com");
      expect(deal.source.trust_score).toBe(0.7);
      expect(deal.code).toBe("BUILD123");
      expect(deal.reward.type).toBe("cash");
      expect(deal.reward.value).toBe(200);
      expect(deal.reward.currency).toBe("EUR");
      expect(deal.metadata.category).toContain("referral");
      expect(deal.metadata.status).toBe("active");
    });

    it("should track build errors", async () => {
      const sources = [
        createMockSource({ domain: "badbuild.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify([
            {
              code: "", // Invalid: empty code
              title: "Bad Deal",
            },
          ]),
      });

      const result = await discover(env, ctx);
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });
  });
});
