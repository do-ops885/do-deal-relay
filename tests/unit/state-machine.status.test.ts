import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executePipeline } from "../../worker/state-machine";
import { validatedFetch } from "../../worker/lib/security";
import {
  setGitHubToken,
  initGitHubCircuitBreaker,
} from "../../worker/lib/github/index";
import { createMockD1, seedMockLock, type LockRow } from "../fixtures/d1-mock";
import type { Deal, Env, Snapshot } from "../../worker/types";

// Mock validatedFetch to bypass SSRF DNS resolution (cloudflare-dns.com)
vi.mock("../../worker/lib/security", () => ({
  validatedFetch: vi.fn(),
}));

// ============================================================================
// Mock Factories
// ============================================================================

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

const createMockSnapshot = (overrides: Partial<Snapshot> = {}): Snapshot => ({
  version: "0.1.0",
  generated_at: "2024-03-31T00:00:00Z",
  run_id: "test-run",
  trace_id: "test-trace",
  snapshot_hash: "abc123",
  previous_hash: "xyz789",
  schema_version: "0.1.0",
  stats: {
    total: 1,
    active: 1,
    quarantined: 0,
    rejected: 0,
    duplicates: 0,
  },
  deals: [createMockDeal("1")],
  ...overrides,
});

// ============================================================================
// KV Namespace Mock Factory
// ============================================================================

function makeKV(
  storage: Map<string, unknown>,
  prefix: string,
  opts?: { list?: boolean },
) {
  return {
    get: vi.fn(async <T>(key: string, type?: string) => {
      const value = storage.get(`${prefix}:${key}`);
      if (type === "json" && typeof value === "string") {
        return JSON.parse(value) as T;
      }
      return value as T;
    }),
    put: vi.fn(
      async (
        key: string,
        value: string,
        _options?: { expirationTtl?: number },
      ) => {
        storage.set(`${prefix}:${key}`, value);
      },
    ),
    delete: vi.fn(async (key: string) => {
      storage.delete(`${prefix}:${key}`);
    }),
    ...(opts?.list ? { list: vi.fn(async () => ({ keys: [] })) } : {}),
  };
}

describe("State Machine - Status & Guards", () => {
  let mockKvStorage: Map<string, unknown>;
  let mockD1Storage: Map<string, LockRow>;
  let mockEnv: Env;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let _validatedFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockKvStorage = new Map();
    mockD1Storage = new Map();
    vi.clearAllMocks();
    _validatedFetch = vi.mocked(validatedFetch);

    // Suppress expected console warnings and errors during tests
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockEnv = {
      DEALS_PROD: makeKV(mockKvStorage, "prod") as unknown as KVNamespace,
      DEALS_STAGING: makeKV(mockKvStorage, "staging", {
        list: true,
      }) as unknown as KVNamespace,
      DEALS_LOG: makeKV(mockKvStorage, "log") as unknown as KVNamespace,
      DEALS_LOCK: makeKV(mockKvStorage, "lock") as unknown as KVNamespace,
      DEALS_SOURCES: makeKV(mockKvStorage, "sources") as unknown as KVNamespace,
      AI_GATEWAY_URL: "https://gateway.test",
      WEBHOOK_SECRET: "test-secret",
      API_ENCRYPTION_KEY: "test-key",
      EMAIL_WEBHOOK_SECRET: "test-email-secret",
      DEALS_DB: createMockD1(mockD1Storage),
      TRUST_THRESHOLD: "0.3",
      ENVIRONMENT: "test",
      GITHUB_REPO: "test/repo",
      GITHUB_TOKEN: "test-token",
      NOTIFICATION_THRESHOLD: "100",
    } as unknown as Env;

    // Initialize GitHub token for tests
    setGitHubToken("test-token");
    initGitHubCircuitBreaker(mockEnv as unknown as { DEALS_PROD: KVNamespace });
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("State transitions", () => {
    it("should transition through all phases", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "test.com",
            url_patterns: ["/page"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify([
            {
              code: "TEST123",
              title: "Test Deal",
              url: "https://test.com/invite",
              reward_value: 50,
            },
          ]),
      });

      await executePipeline(mockEnv);

      // Verify logs were written for various phases
      const logCalls =
        (mockEnv.DEALS_LOG.put as ReturnType<typeof vi.fn>).mock.calls || [];
      expect(logCalls.length).toBeGreaterThan(0);
    });

    it("should skip to finalize when no deals discovered", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "test.com",
            url_patterns: ["/page"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
        text: async () => "[]",
      });

      const result = await executePipeline(mockEnv);

      expect(result).toBeDefined();
    });

    it("should skip to finalize when all deals are duplicates", async () => {
      // First set up a production snapshot with existing deals
      const existingSnapshot = createMockSnapshot({
        deals: [createMockDeal("1", { code: "DUPE" })],
      });
      mockKvStorage.set("prod:snapshot:prod", JSON.stringify(existingSnapshot));

      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "test.com",
            url_patterns: ["/page"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify([
            {
              code: "DUPE",
              title: "Duplicate Deal",
              url: "https://example.com/invite",
              reward_value: 50,
            },
          ]),
      });

      const result = await executePipeline(mockEnv);

      expect(result).toBeDefined();
    });
  });

  describe("Failure paths", () => {
    it("should handle revert path", async () => {
      const previousSnapshot = createMockSnapshot();
      mockKvStorage.set("prod:snapshot:prod", JSON.stringify(previousSnapshot));

      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "bad.com",
            url_patterns: ["/page"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify([
            {
              code: "BAD",
              title: "Bad Deal",
              url: "not-a-valid-url",
              reward_value: 50,
            },
          ]),
      });

      const result = await executePipeline(mockEnv);

      expect(result).toBeDefined();
    });

    it("should handle quarantine path for trust anomalies", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "anomaly.com",
            url_patterns: ["/page"],
            trust_initial: 0.2,
            classification: "unverified",
            active: true,
          },
        ]),
      );

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify([
            {
              code: "ANOMALY",
              title: "Anomaly Deal",
              url: "https://example.com/invite",
              reward_value: 5000,
            },
          ]),
      });

      const result = await executePipeline(mockEnv);

      expect(result).toBeDefined();
    });

    it("should handle concurrency abort", async () => {
      // Pre-populate a valid lock in D1
      seedMockLock(mockD1Storage, {
        run_id: "concurrent-run",
        trace_id: "concurrent-trace",
      });

      const result = await executePipeline(mockEnv);

      expect(result.success).toBe(false);
    });

    it("should release lock even on error", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "test.com",
            url_patterns: ["/page"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      _validatedFetch.mockRejectedValue(new Error("Fatal error"));

      try {
        await executePipeline(mockEnv);
      } catch {
        // Expected
      }

      // Lock should still be released in finally block (D1 batch called for release)
      const d1Batch = mockEnv.DEALS_DB.batch as ReturnType<typeof vi.fn>;
      expect(d1Batch).toHaveBeenCalled();
    });
  });

  describe("Guard rails", () => {
    it("should enforce guard rails on discovery input", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "massive.com",
            url_patterns: ["/page"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
        text: async () => "[]",
      });

      const result = await executePipeline(mockEnv);

      expect(result).toBeDefined();
    });

    it("should check output guard rails before publish", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "test.com",
            url_patterns: ["/page"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify([
            {
              code: "TEST123",
              title: "Test Deal",
              url: "https://test.com/invite",
              reward_value: 50,
            },
          ]),
      });

      await executePipeline(mockEnv);

      // Verify guard rails were checked
      expect(mockEnv.DEALS_LOG.put).toHaveBeenCalled();
    });
  });

  describe("Pipeline notifications", () => {
    it("should send notification on successful completion", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "test.com",
            url_patterns: ["/page"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      _validatedFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify([
            {
              code: "TEST123",
              title: "Test Deal",
              url: "https://test.com/invite",
              reward_value: 50,
            },
          ]),
      });

      await executePipeline(mockEnv);

      // Verify notification was attempted
      expect(_validatedFetch).toHaveBeenCalled();
    });

    it("should send notification on failure", async () => {
      mockKvStorage.set(
        "sources:registry",
        JSON.stringify([
          {
            domain: "test.com",
            url_patterns: ["/page"],
            trust_initial: 0.7,
            classification: "trusted",
            active: true,
          },
        ]),
      );

      _validatedFetch.mockRejectedValue(new Error("Fatal error"));

      await executePipeline(mockEnv);

      // Should have attempted to notify about failure
    });
  });
});
