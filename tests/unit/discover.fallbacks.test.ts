import { describe, it, expect, vi, beforeEach } from "vitest";
import { discover } from "../../worker/pipeline/discover";
import { validatedFetch } from "../../worker/lib/security";
import { CURATED_DEALS_KV_KEY } from "../../worker/lib/curated-deals";
import type { Env, PipelineContext, SourceConfig } from "../../worker/types";
import type { D1Database } from "@cloudflare/workers-types";

// Only the network call is stubbed: the rest of the module (notably
// validateReferralUrl) must stay real so curated/AI URL checks behave as in
// production.
vi.mock("../../worker/lib/security", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../worker/lib/security")>();
  return { ...actual, validatedFetch: vi.fn() };
});

type KVLike = {
  get: <T>(key: string, type?: string) => Promise<T | null>;
  put: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: () => Promise<{ keys: { name: string }[] }>;
};

const source = (overrides: Partial<SourceConfig> = {}): SourceConfig => ({
  domain: "example.com",
  url_patterns: ["/invite"],
  trust_initial: 0.7,
  classification: "probationary",
  active: true,
  ...overrides,
});

const ctx: PipelineContext = {
  run_id: "discover-fallback-run",
  trace_id: "discover-fallback-trace",
  start_time: Date.now(),
  candidates: [],
  normalized: [],
  deduped: [],
  validated: [],
  scored: [],
  errors: [],
  retry_count: 0,
};

interface EnvOptions {
  sources?: SourceConfig[];
  curated?: unknown[];
  aiExtractorEnabled?: boolean;
  aiResponder?: () => unknown;
}

function createEnv(options: EnvOptions = {}): {
  env: Env;
  store: Map<string, unknown>;
  aiRun: ReturnType<typeof vi.fn>;
} {
  const store = new Map<string, unknown>();
  store.set("registry", options.sources ?? [source()]);
  if (options.curated !== undefined) {
    store.set(CURATED_DEALS_KV_KEY, options.curated);
  }
  store.set("__ff_initialized__", "true");
  if (options.aiExtractorEnabled) {
    store.set("ff:ai_extractor_scraper", {
      name: "ai_extractor_scraper",
      enabled: true,
      rolloutPercentage: 100,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  }

  const kv: KVLike = {
    get: async <T>(key: string) => (store.get(key) as T) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, JSON.parse(value));
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({ keys: [...store.keys()].map((name) => ({ name })) }),
  };

  const aiRun = vi.fn(
    options.aiResponder ??
      (() => ({
        response: JSON.stringify([
          {
            code: "AICODE55",
            url: "https://example.com/invite/AICODE55",
            reward: "$25 bonus",
            confidence: 0.9,
          },
        ]),
      })),
  );

  const env = {
    DEALS_PROD: kv,
    DEALS_STAGING: kv,
    DEALS_LOG: kv,
    DEALS_LOCK: kv,
    DEALS_SOURCES: kv,
    DEALS_DB: undefined as unknown as D1Database,
    AI: { run: aiRun },
    TRUST_THRESHOLD: "0.3",
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    NOTIFICATION_THRESHOLD: "100",
    API_ENCRYPTION_KEY: "test-key",
    WEBHOOK_SECRET: "test-secret",
    EMAIL_WEBHOOK_SECRET: "test-email-secret",
  } as unknown as Env;

  return { env, store, aiRun };
}

function okHtml(body: string): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "text/html" }),
    text: async () => body,
  } as unknown as Response;
}

function redirectTo(location: string): Response {
  return {
    ok: false,
    status: 301,
    headers: new Headers({ location }),
    text: async () => "",
  } as unknown as Response;
}

describe("discovery fallbacks", () => {
  const mockFetch = () => vi.mocked(validatedFetch);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges operator-curated deals even when every source fetch fails", async () => {
    const fetchMock = mockFetch();
    const { env } = createEnv({
      curated: [
        {
          code: "CURATED1",
          url: "https://example.com/invite/CURATED1",
          domain: "example.com",
          title: "Curated deal",
          reward_type: "cash",
          reward_value: 10,
        },
      ],
    });
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await discover(env, ctx);

    expect(result.deals.map((deal) => deal.code)).toContain("CURATED1");
    expect(result.deals[0]?.metadata.status).toBe("active");
  });

  it("follows a 301 to the canonical host before parsing", async () => {
    const fetchMock = mockFetch();
    const { env } = createEnv();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "https://example.com/invite") {
        return redirectTo("https://www.example.com/invite");
      }
      return okHtml("<html><body><p>stuff</p></body></html>");
    });

    await discover(env, ctx);

    // First hop apex, second hop www — each validated independently.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://www.example.com/invite");
  });

  it("caps redirect chains and reports the remaining non-2xx", async () => {
    const fetchMock = mockFetch();
    const { env } = createEnv();
    fetchMock.mockImplementation(async (url: string) =>
      redirectTo(`${url}/loop`),
    );

    const result = await discover(env, ctx);

    // Initial request + MAX_DISCOVERY_REDIRECTS (2) hops, then give up.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.deals).toHaveLength(0);
    expect(result.errors[0]?.error).toContain("HTTP 301");
  });

  it("uses AI extraction when static selectors find nothing (flag on)", async () => {
    const fetchMock = mockFetch();
    const { env, aiRun } = createEnv({ aiExtractorEnabled: true });
    fetchMock.mockResolvedValue(
      okHtml("<html><body>Join with code from the app</body></html>"),
    );

    const result = await discover(env, ctx);

    expect(aiRun).toHaveBeenCalled();
    const deal = result.deals.find((d) => d.code === "AICODE55");
    expect(deal).toBeDefined();
    expect(deal?.reward.value).toBe(25);
    expect(deal?.url).toBe("https://example.com/invite/AICODE55");
  });

  it("does not call Workers AI when the extractor flag is off", async () => {
    const fetchMock = mockFetch();
    const { env, aiRun } = createEnv({ aiExtractorEnabled: false });
    fetchMock.mockResolvedValue(
      okHtml("<html><body>Join with code from the app</body></html>"),
    );

    const result = await discover(env, ctx);

    expect(aiRun).not.toHaveBeenCalled();
    expect(result.deals).toHaveLength(0);
  });

  it("replaces off-domain AI URLs with the canonical invite URL", async () => {
    const fetchMock = mockFetch();
    const { env } = createEnv({
      aiExtractorEnabled: true,
      aiResponder: () => ({
        response: JSON.stringify([
          {
            code: "EVILCODE1",
            url: "https://attacker.example/invite/EVILCODE1",
            confidence: 0.9,
          },
        ]),
      }),
    });
    fetchMock.mockResolvedValue(
      okHtml("<html><body>nothing static</body></html>"),
    );

    const result = await discover(env, ctx);
    const deal = result.deals.find((d) => d.code === "EVILCODE1");

    expect(deal?.url).toBe("https://example.com/invite/EVILCODE1");
  });
});
