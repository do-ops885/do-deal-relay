import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CURATED_DEALS_KV_KEY,
  CURATED_DEFAULT_TRUST,
  curatedEntryToDeal,
  importCuratedDeals,
  loadCuratedDeals,
  readCuratedDeals,
} from "../../worker/lib/curated-deals";
import { validate } from "../../worker/validation/pipeline";
import { DealSchema } from "../../worker/types";
import type {
  Deal,
  Env,
  PipelineContext,
  SourceConfig,
} from "../../worker/types";
import type { D1Database } from "@cloudflare/workers-types";

type KVLike = {
  get: <T>(key: string, type?: string) => Promise<T | null>;
  put: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: () => Promise<{ keys: { name: string }[] }>;
};

function createSource(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    domain: "trading212.com",
    url_patterns: ["/invite/"],
    trust_initial: 0.7,
    classification: "probationary",
    active: true,
    ...overrides,
  };
}

function createEnv(
  sources: SourceConfig[] = [],
  seedCurated?: unknown,
): { env: Env; store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  store.set("registry", sources);
  if (seedCurated !== undefined) {
    store.set(CURATED_DEALS_KV_KEY, seedCurated);
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

  const env = {
    DEALS_SOURCES: kv,
    DEALS_PROD: {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
    },
    DEALS_LOCK: kv,
    DEALS_STAGING: kv,
    DEALS_LOG: kv,
    DEALS_DB: {} as unknown as D1Database,
    TRUST_THRESHOLD: "0.3",
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    NOTIFICATION_THRESHOLD: "100",
    API_ENCRYPTION_KEY: "test-key",
    WEBHOOK_SECRET: "test-secret",
    EMAIL_WEBHOOK_SECRET: "test-email-secret",
  } as unknown as Env;

  return { env, store };
}

function createContext(): PipelineContext {
  return {
    run_id: "curated-test-run",
    trace_id: "curated-test-trace",
    start_time: Date.now(),
    candidates: [],
    normalized: [],
    deduped: [],
    validated: [],
    scored: [],
    errors: [],
    retry_count: 0,
  };
}

const validEntry = {
  code: "abc123",
  url: "https://www.trading212.com/invite/abc123?utm_source=affiliate",
  domain: "WWW.Trading212.com",
  title: "Trading 212 invite",
  reward_type: "cash",
  reward_value: 25,
  reward_currency: "usd",
};

describe("curated deals", () => {
  beforeEach(() => {
    // no shared state between tests
  });
  afterEach(() => {
    // no timers/listeners to clean up
  });

  it("imports, canonicalizes, and stores an operator code", async () => {
    const { env, store } = createEnv([createSource()]);

    const summary = await importCuratedDeals(env, [validEntry]);

    expect(summary.accepted).toBe(1);
    expect(summary.rejected).toHaveLength(0);
    expect(summary.stored).toBe(1);

    const stored = store.get(CURATED_DEALS_KV_KEY) as Array<
      Record<string, unknown>
    >;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      code: "ABC123",
      domain: "trading212.com",
      url: "https://www.trading212.com/invite/abc123",
      reward_currency: "USD",
    });
  });

  it("upserts by domain+code instead of duplicating", async () => {
    const { env, store } = createEnv([createSource()]);

    await importCuratedDeals(env, [validEntry]);
    await importCuratedDeals(env, [{ ...validEntry, title: "Updated title" }]);

    const stored = store.get(CURATED_DEALS_KV_KEY) as Array<
      Record<string, unknown>
    >;
    expect(stored).toHaveLength(1);
    expect(stored[0]?.title).toBe("Updated title");
  });

  it("rejects non-https, off-domain, and gate-2-breaking URLs", async () => {
    const { env } = createEnv([createSource()]);

    const summary = await importCuratedDeals(env, [
      {
        ...validEntry,
        code: "HTTPCODE",
        url: "http://trading212.com/invite/x",
      },
      {
        ...validEntry,
        code: "OFFDOMAIN",
        url: "https://evil.example/invite/OFFDOMAIN",
      },
      {
        ...validEntry,
        code: "REFPATH1",
        url: "https://trading212.com/referral/REFPATH1",
      },
    ]);

    expect(summary.accepted).toBe(0);
    expect(summary.rejected).toHaveLength(3);
    expect(summary.rejected.map((r) => r.code)).toEqual([
      "HTTPCODE",
      "OFFDOMAIN",
      "REFPATH1",
    ]);
  });

  it("reads tolerantly: corrupt KV payload yields no entries", async () => {
    const { env } = createEnv([], { not: "an-array" });
    await expect(readCuratedDeals(env)).resolves.toEqual([]);
  });

  it("builds a schema-valid deal using registry trust", async () => {
    const sources = [createSource({ trust_initial: 0.7 })];
    const { env } = createEnv(sources);
    await importCuratedDeals(env, [validEntry]);

    const [entry] = await readCuratedDeals(env);
    expect(entry).toBeDefined();
    const deal = await curatedEntryToDeal(entry!, sources);

    expect(DealSchema.safeParse(deal).success).toBe(true);
    expect(deal.code).toBe("ABC123");
    expect(deal.source.domain).toBe("trading212.com");
    expect(deal.source.trust_score).toBe(0.7);
    expect(deal.metadata.status).toBe("active");
  });

  it("falls back to curated trust for domains outside the registry", async () => {
    const { env } = createEnv([]);
    await importCuratedDeals(env, [validEntry]);

    const [entry] = await readCuratedDeals(env);
    const deal = await curatedEntryToDeal(entry!, []);

    expect(deal.source.trust_score).toBe(CURATED_DEFAULT_TRUST);
    expect(deal.source.trust_score).toBeGreaterThan(0.5);
  });

  it("passes all 9 validation gates unchanged", async () => {
    const sources = [createSource({ trust_initial: 0.7 })];
    const { env } = createEnv(sources);
    await importCuratedDeals(env, [validEntry]);

    const [entry] = await readCuratedDeals(env);
    const deal: Deal = await curatedEntryToDeal(entry!, sources);

    const result = await validate([deal], createContext(), env);

    expect(result.stats.invalid).toBe(0);
    expect(result.stats.valid).toBe(1);
    expect(result.valid[0]?.metadata.validation_gates?.failed ?? []).toEqual(
      [],
    );
  });

  it("loads curated candidates but skips registry-blocked domains", async () => {
    const sources = [
      createSource({ domain: "trading212.com" }),
      createSource({
        domain: "blocked.example",
        classification: "blocked",
        trust_initial: 0.9,
      }),
    ];
    const { env } = createEnv(sources);
    await importCuratedDeals(env, [
      validEntry,
      {
        ...validEntry,
        code: "BLOCKED1",
        domain: "blocked.example",
        url: "https://blocked.example/invite/BLOCKED1",
      },
    ]);

    const deals = await loadCuratedDeals(env, sources);

    expect(deals.map((d) => d.code)).toEqual(["ABC123"]);
  });
});
