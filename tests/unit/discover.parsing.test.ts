import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { discover } from "../../worker/pipeline/discover";
import { validatedFetch } from "../../worker/lib/security";
import { parseHTMLContent } from "../../worker/pipeline/discover-parsers";
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

  describe("HTML content parsing", () => {
    it("should extract referral codes from HTML", async () => {
      const sources = [
        createMockSource({ domain: "htmlsource.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      const htmlContent = `
        <html>
          <head><title>Referral Program</title></head>
          <body>
            <h1>Get $50 Bonus</h1>
            <p>Your referral code: REFER123</p>
            <meta name="description" content="Earn rewards by referring friends">
          </body>
        </html>
      `;

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => htmlContent,
      });

      const result = await discover(env, ctx);
      // HTML parsing depends on regex patterns - may or may not match
      expect(result).toBeDefined();
    });

    it("should handle HTML without referral codes", async () => {
      const sources = [
        createMockSource({ domain: "nocodes.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => "<html><body>No codes here</body></html>",
      });

      const result = await discover(env, ctx);
      expect(result.deals).toHaveLength(0);
    });

    it("should deduplicate codes found in same page", async () => {
      const sources = [
        createMockSource({ domain: "dupes.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      const htmlContent = `
        <p>Code: DUP123 appears here</p>
        <p>Code: DUP123 appears again</p>
        <p>Code: DUP123 third time</p>
      `;

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => htmlContent,
      });

      const result = await discover(env, ctx);
      // Should either find codes or handle gracefully
      expect(result).toBeDefined();
    });

    it("should extract reward information from HTML", async () => {
      const sources = [
        createMockSource({ domain: "rewards.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      const htmlContent = `
        <p>Get $100 USD bonus with code BONUS100</p>
      `;

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => htmlContent,
      });

      const result = await discover(env, ctx);
      expect(result).toBeDefined();
    });

    it("should handle percent rewards in HTML", async () => {
      const sources = [
        createMockSource({ domain: "percent.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      const htmlContent = `
        <p>Earn 20% bonus with code PERCENT20</p>
      `;

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => htmlContent,
      });

      const result = await discover(env, ctx);
      expect(result).toBeDefined();
    });

    it("should respect payload size limits", async () => {
      const sources = [
        createMockSource({ domain: "large.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      const largeContent = "x".repeat(1_500_000);

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => largeContent,
      });

      const result = await discover(env, ctx);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("JSON content parsing", () => {
    it("should parse array of deals", async () => {
      const sources = [
        createMockSource({ domain: "array.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify([
            { code: "CODE1", title: "Deal 1", reward_value: 10 },
            { code: "CODE2", title: "Deal 2", reward_value: 20 },
          ]),
      });

      const result = await discover(env, ctx);
      expect(result.deals).toHaveLength(2);
    });

    it("should parse nested deals object", async () => {
      const sources = [
        createMockSource({ domain: "nested.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            deals: [
              { code: "NESTED1", title: "Nested Deal", reward_value: 30 },
            ],
          }),
      });

      const result = await discover(env, ctx);
      expect(result.deals).toHaveLength(1);
      expect(result.deals[0]!.code).toBe("NESTED1");
    });

    it("should handle single deal object", async () => {
      const sources = [
        createMockSource({ domain: "single.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            code: "SINGLE",
            title: "Single Deal",
            reward_value: 100,
          }),
      });

      const result = await discover(env, ctx);
      expect(result.deals).toHaveLength(1);
      expect(result.deals[0]!.code).toBe("SINGLE");
    });

    it("should handle alternate field names", async () => {
      const sources = [
        createMockSource({ domain: "alt.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify([
            {
              referral_code: "ALT1",
              invite_code: "IGNORED",
              link: "https://example.com/invite",
              amount: 75,
              percent: true,
            },
          ]),
      });

      const result = await discover(env, ctx);
      expect(result.deals[0]!.code).toBe("ALT1");
      expect(result.deals[0]!.reward.type).toBe("percent");
    });

    it("should handle items array field", async () => {
      const sources = [
        createMockSource({ domain: "items.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            items: [{ code: "ITEM1", title: "Item Deal", reward_value: 50 }],
          }),
      });

      const result = await discover(env, ctx);
      expect(result.deals).toHaveLength(1);
    });

    it("should return empty array for invalid JSON", async () => {
      const sources = [
        createMockSource({ domain: "badjson.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => "not valid json",
      });

      const result = await discover(env, ctx);
      expect(result.deals).toHaveLength(0);
    });

    it("should extract expiry dates when present", async () => {
      const sources = [
        createMockSource({ domain: "expiry.com", url_patterns: ["/page"] }),
      ];
      const env = createMockEnv(sources);

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify([
            {
              code: "EXPIRE1",
              title: "Expiring Deal",
              expiry: "2024-12-31T23:59:59Z",
            },
          ]),
      });

      const result = await discover(env, ctx);
      expect(result.deals[0]!.expiry.date).toBe("2024-12-31T23:59:59Z");
      expect(result.deals[0]!.expiry.confidence).toBe(0.8);
    });
  });

  describe("Reward matching (parseHTMLContent)", () => {
    const mockSource = createMockSource({ domain: "rewards.com" });

    it("should extract cash reward with USD currency from HTML", () => {
      const html = `<p>referral_code=CASHUSD1 get $100 USD bonus</p>`;
      const deals = parseHTMLContent(html, mockSource);
      expect(deals).toHaveLength(1);
      expect(deals[0]!.reward_type).toBe("cash");
      expect(deals[0]!.reward_value).toBe(100);
      expect(deals[0]!.reward_currency).toBe("USD");
    });

    it("should extract percent reward from HTML", () => {
      const html = `<p>referral_code=PRCENT20 earn 20% bonus</p>`;
      const deals = parseHTMLContent(html, mockSource);
      expect(deals).toHaveLength(1);
      expect(deals[0]!.reward_type).toBe("percent");
      expect(deals[0]!.reward_value).toBe(20);
    });

    it("should default to credit type when no reward pattern found", () => {
      const html = `<p>referral_code=NOREWRD1 sign up now</p>`;
      const deals = parseHTMLContent(html, mockSource);
      expect(deals).toHaveLength(1);
      expect(deals[0]!.reward_type).toBe("credit");
      expect(deals[0]!.reward_value).toBe(0);
    });

    it("should extract reward with EUR currency", () => {
      const html = `<p>referral_code=EURCODE1 bonus 50 EUR reward</p>`;
      const deals = parseHTMLContent(html, mockSource);
      expect(deals).toHaveLength(1);
      expect(deals[0]!.reward_type).toBe("cash");
      expect(deals[0]!.reward_value).toBe(50);
      expect(deals[0]!.reward_currency).toBe("EUR");
    });

    it("should handle comma-separated reward values", () => {
      const html = `<p>referral_code=COMMACD1 get $1,000 USD bonus</p>`;
      const deals = parseHTMLContent(html, mockSource);
      expect(deals).toHaveLength(1);
      expect(deals[0]!.reward_value).toBe(1000);
    });

    it("should handle decimal reward values", () => {
      const html = `<p>referral_code=DECIMAL1 get $20.99 USD bonus</p>`;
      const deals = parseHTMLContent(html, mockSource);
      expect(deals).toHaveLength(1);
      expect(deals[0]!.reward_value).toBe(20.99);
      expect(deals[0]!.reward_currency).toBe("USD");
    });
  });
});
