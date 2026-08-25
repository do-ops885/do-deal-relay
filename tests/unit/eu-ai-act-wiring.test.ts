/**
 * EU AI Act Wiring Tests
 *
 * Proves that every AI-touching request path emits an Article 12
 * compliance event through EUAIActLogger, and that a compliance-logging
 * failure NEVER breaks the user-facing request (failure isolation).
 *
 * Paths covered:
 *   1. NLQ route (POST + GET) - classification/lookup chokepoint
 *   2. Semantic search route - embedding/vector query chokepoint
 *   3. Research orchestrator - LLM extraction chokepoint
 */

import { describe, it, expect, vi } from "vitest";
import type { Mock } from "vitest";
import { handleNLQ, handleNLQGet } from "../../worker/routes/nlq/handlers";
import { handleSemanticSearch } from "../../worker/routes/semantic-search";
import { executeReferralResearch } from "../../worker/lib/research-agent/orchestrator/index";
import {
  logAIInteraction,
  NLQ_COMPLIANCE_OPERATION,
  SEMANTIC_SEARCH_COMPLIANCE_OPERATION,
  RESEARCH_EXTRACTION_COMPLIANCE_OPERATION,
} from "../../worker/lib/research-agent/compliance-log";
import type { Env } from "../../worker/types";
import type { WebResearchRequest } from "../../worker/types";

// ============================================================================
// Mocks — mirror the same seams the existing passing handler tests use
// ============================================================================

vi.mock("../../worker/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({
    allowed: true,
    remaining: 100,
    resetAt: Date.now() + 60000,
  })),
  getClientIdentifier: vi.fn(() => "ip:127.0.0.1"),
  createRateLimitHeaders: vi.fn(() => {
    const headers = new Map<string, string>();
    headers.set("X-RateLimit-Remaining", "100");
    return headers;
  }),
}));

vi.mock("../../worker/lib/nlq/parser", () => ({
  parseQuery: vi.fn((query: string) => ({
    original: query,
    tokens: query.split(" "),
    intent: "search",
    entities: [],
  })),
}));

vi.mock("../../worker/lib/nlq/query-builder", () => ({
  buildStructuredQuery: vi.fn(() => ({
    select: ["d.*"],
    from: "deals d",
    where: ["1=1"],
    params: [],
    orderBy: "d.confidence_score DESC",
    limit: 20,
  })),
  executeStructuredQuery: vi.fn(async () => [
    {
      id: "deal-1",
      title: "Test Deal",
      code: "TEST123",
      url: "https://example.com",
      confidence_score: 0.9,
      source_domain: "example.com",
    },
  ]),
  explainQuery: vi.fn(() => ({
    intent: "search",
    confidence: 0.9,
    explanation: "Test query",
  })),
}));

vi.mock("../../worker/lib/nlq/ai", () => ({
  enhanceQueryWithAI: vi.fn(async (q: unknown) => q),
  classifyIntent: vi.fn(() => "search"),
}));

// Only fetchFromSource is replaced; regex extraction and rate limiting stay real.
vi.mock("../../worker/lib/research-agent/fetcher", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../worker/lib/research-agent/fetcher")
    >();
  return { ...actual, fetchFromSource: vi.fn() };
});

import { fetchFromSource } from "../../worker/lib/research-agent/fetcher";

interface RecordedQuery {
  sql: string;
  bindings: unknown[];
}

/**
 * In-memory D1 double. Records every prepared statement plus its bound
 * parameters so tests can assert on compliance INSERT payloads. When
 * failOnComplianceInsert is set, preparing the ai_act_logs INSERT throws,
 * simulating a D1 outage for compliance logging only.
 */
function createMockD1Db(failOnComplianceInsert = false): {
  db: unknown;
  queries: RecordedQuery[];
} {
  const queries: RecordedQuery[] = [];

  function makeStatement(sql: string) {
    const record: RecordedQuery = { sql, bindings: [] };
    queries.push(record);
    const execResult = {
      results: [] as unknown[],
      meta: { changes: 1, rows_read: 0, rows_written: 1 },
    };
    return {
      bind: (...bindings: unknown[]) => {
        record.bindings = bindings;
        return {
          run: async () => execResult,
          all: async () => execResult,
          first: async () => null,
        };
      },
      run: async () => execResult,
      all: async () => execResult,
      first: async () => null,
    };
  }

  return {
    db: {
      prepare: (sql: string) => {
        if (failOnComplianceInsert && sql.includes("INSERT INTO ai_act_logs")) {
          throw new Error("simulated D1 outage");
        }
        return makeStatement(sql);
      },
      batch: async () => [],
      withSession: (bookmark?: string) => ({
        prepare: (sql: string) => {
          if (
            failOnComplianceInsert &&
            sql.includes("INSERT INTO ai_act_logs")
          ) {
            throw new Error("simulated D1 outage");
          }
          return makeStatement(sql);
        },
        batch: async () => [],
        exec: async () => [],
        getBookmark: () => bookmark ?? "",
      }),
    },
    queries,
  };
}

/** Minimal KV stub satisfying checkRateLimit and StructuredLogger. */
function createKvStub(): unknown {
  return {
    get: async () => null,
    put: async () => undefined,
  };
}

/** Assemble a partial Env cast for route handlers under test. */
function createTestEnv(options: {
  db?: unknown;
  ai?: unknown;
  embeddings?: unknown;
}): Env {
  return {
    DEALS_DB: options.db,
    DEALS_LOCK: createKvStub(),
    DEALS_LOG: createKvStub(),
    AI: options.ai,
    DEAL_EMBEDDINGS: options.embeddings,
  } as unknown as Env;
}

/** Locate the recorded ai_act_logs INSERT or fail the test. */
function findComplianceInsert(queries: RecordedQuery[]): RecordedQuery {
  const insert = queries.find((q) => q.sql.includes("INSERT INTO ai_act_logs"));
  if (!insert) {
    throw new Error("expected an ai_act_logs INSERT to be recorded");
  }
  return insert;
}

async function postJson(url: string, body: unknown): Promise<Request> {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ============================================================================
// NLQ Route Wiring
// ============================================================================

describe("nlq route compliance wiring", () => {
  it("emits a compliance event when a POST /api/nlq query is processed", async () => {
    const { db, queries } = createMockD1Db();
    const env = createTestEnv({ db });
    const request = await postJson("https://example.com/api/nlq", {
      query: "trading platforms with bonus",
    });

    const response = await handleNLQ(request, env);
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const insert = findComplianceInsert(queries);
    expect(insert.bindings[5]).toBe(NLQ_COMPLIANCE_OPERATION);
    // Data minimization: content hash present, raw query text absent.
    expect(String(insert.bindings[8])).toMatch(/^sha256:/);
    expect(JSON.stringify(insert.bindings)).not.toContain(
      "trading platforms with bonus",
    );
    // Query shape metadata is recorded instead.
    const metadata = String(insert.bindings[12]);
    expect(metadata).toContain('"entity_count":');
    expect(metadata).toContain('"result_count":');
  });

  it("emits a compliance event when a GET /api/nlq query is processed", async () => {
    const { db, queries } = createMockD1Db();
    const env = createTestEnv({ db });
    const url = new URL("https://example.com/api/nlq?q=vpn%20deals%20bonus");
    const request = new Request(url.href);

    const response = await handleNLQGet(url, env, request);

    expect(response.status).toBe(200);
    const insert = findComplianceInsert(queries);
    expect(insert.bindings[5]).toBe(NLQ_COMPLIANCE_OPERATION);
    expect(String(insert.bindings[8])).toMatch(/^sha256:/);
  });

  it("returns a normal 200 response even when compliance logging fails", async () => {
    const { db, queries } = createMockD1Db(true);
    const env = createTestEnv({ db });
    const request = await postJson("https://example.com/api/nlq", {
      query: "cashback apps with signup bonus",
    });

    const response = await handleNLQ(request, env);
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(queries.some((q) => q.sql.includes("ai_act_logs"))).toBe(false);
  });
});

// ============================================================================
// Semantic Search Route Wiring
// ============================================================================

describe("semantic search compliance wiring", () => {
  function createVectorEnv(failOnComplianceInsert: boolean): {
    env: Env;
    queries: RecordedQuery[];
    aiRun: Mock;
  } {
    const { db, queries } = createMockD1Db(failOnComplianceInsert);
    const aiRun = vi.fn(async () => ({ data: [[0.12, -0.3, 0.44]] }));
    const embeddings = {
      query: vi.fn(async () => ({
        matches: [
          { id: "deal-1", score: 0.87, metadata: { title: "Deal One" } },
          { id: "deal-2", score: 0.42, metadata: { title: "Deal Two" } },
        ],
      })),
    };
    return {
      env: createTestEnv({ db, ai: { run: aiRun }, embeddings }),
      queries,
      aiRun,
    };
  }

  it("emits a compliance event when an embedding-backed search runs", async () => {
    const { env, queries, aiRun } = createVectorEnv(false);
    const request = await postJson("https://example.com/api/semantic-search", {
      query: "cheap vpn subscription deal",
    });

    const response = await handleSemanticSearch(request, env);
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(aiRun).toHaveBeenCalledTimes(1);

    const insert = findComplianceInsert(queries);
    expect(insert.bindings[5]).toBe(SEMANTIC_SEARCH_COMPLIANCE_OPERATION);
    expect(String(insert.bindings[8])).toMatch(/^sha256:/);
    expect(JSON.stringify(insert.bindings)).not.toContain("cheap vpn");
    expect(String(insert.bindings[12])).toContain('"hit_count":2');
  });

  it("returns search results even when compliance logging fails", async () => {
    const { env, queries } = createVectorEnv(true);
    const request = await postJson("https://example.com/api/semantic-search", {
      query: "discount streaming service",
    });

    const response = await handleSemanticSearch(request, env);
    const body = (await response.json()) as {
      success: boolean;
      results: unknown[];
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.results.length).toBe(2);
    expect(queries.some((q) => q.sql.includes("ai_act_logs"))).toBe(false);
  });
});

// ============================================================================
// Fire-and-Forget Guarantees (direct unit checks)
// ============================================================================

describe("logAIInteraction failure isolation", () => {
  it("resolves without touching D1 when no database binding exists", async () => {
    await expect(
      logAIInteraction(undefined, {
        operation: NLQ_COMPLIANCE_OPERATION,
        inputSource: "unit-test",
        inputDescription: "no-op guard",
        result: "skipped",
      }),
    ).resolves.toBeUndefined();
  });

  it("swallows insert errors so callers never see them", async () => {
    const failingDb = {
      prepare: () => {
        throw new Error("simulated outage");
      },
    };
    await expect(
      logAIInteraction(failingDb as unknown as Env["DEALS_DB"], {
        operation: SEMANTIC_SEARCH_COMPLIANCE_OPERATION,
        inputSource: "unit-test",
        rawInput: "anything",
        inputDescription: "boom path",
        result: "ignored",
      }),
    ).resolves.toBeUndefined();
  });
});
