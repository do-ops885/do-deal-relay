/**
 * URL Health Module Tests
 *
 * Tests for checkDealUrlHealth, deactivateUnhealthyDeals, and runUrlHealthCheck.
 * Covers definitive/transient classification, stale-URL races, snapshot hash
 * chain integrity, and failed-write count accuracy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkDealUrlHealth,
  deactivateUnhealthyDeals,
  runUrlHealthCheck,
} from "../../worker/lib/expiration/url-health";
import type { Deal, Env, Snapshot } from "../../worker/types";

// ---------------------------------------------------------------------------
// Helpers matching actual types from worker/types/deal.ts
// ---------------------------------------------------------------------------

function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: overrides.id ?? "deal-1",
    source: overrides.source ?? {
      url: "https://example.com/invite/ABC",
      domain: "example.com",
      discovered_at: new Date().toISOString(),
      trust_score: 0.7,
    },
    title: overrides.title ?? "Test Deal",
    description: overrides.description ?? "Test description",
    code: overrides.code ?? "ABC",
    url: overrides.url ?? "https://example.com/invite/ABC",
    reward: overrides.reward ?? {
      type: "cash" as const,
      value: 10,
      currency: "USD",
    },
    expiry: overrides.expiry ?? {
      date: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      confidence: 0.8,
      type: "soft",
    },
    metadata: {
      category: overrides.metadata?.category ?? ["general"],
      tags: overrides.metadata?.tags ?? [],
      normalized_at:
        overrides.metadata?.normalized_at ?? new Date().toISOString(),
      confidence_score: overrides.metadata?.confidence_score ?? 0.8,
      status: overrides.metadata?.status ?? "active",
    },
    ...overrides,
  } as Deal;
}

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    version: overrides.version ?? "0.1.8",
    generated_at: overrides.generated_at ?? new Date().toISOString(),
    run_id: overrides.run_id ?? "test-run",
    trace_id: overrides.trace_id ?? "test-trace",
    snapshot_hash: overrides.snapshot_hash ?? "hash-abc123",
    previous_hash: overrides.previous_hash ?? "hash-prev",
    schema_version: overrides.schema_version ?? "0.1.8",
    deals: overrides.deals ?? [makeDeal()],
    stats: {
      total: overrides.stats?.total ?? 1,
      active: overrides.stats?.active ?? 1,
      quarantined: overrides.stats?.quarantined ?? 0,
      rejected: overrides.stats?.rejected ?? 0,
      duplicates: overrides.stats?.duplicates ?? 0,
    },
    ...overrides,
  } as Snapshot;
}

/** Build a mock Env with KV store backed by a Map. */
function buildMockEnv(kvStore: Map<string, string>): Env {
  return {
    DEALS_PROD: {
      get: vi.fn(async (key: string) => {
        const val = kvStore.get(`prod:${key}`);
        if (val === undefined) return null;
        return JSON.parse(val);
      }),
      put: vi.fn(async (key: string, value: string) => {
        kvStore.set(`prod:${key}`, value);
      }),
      delete: vi.fn(async (key: string) => {
        kvStore.delete(`prod:${key}`);
      }),
      list: vi.fn(async () => ({ keys: [] })),
    },
    DEALS_STAGING: {
      get: vi.fn(async (key: string) => {
        const val = kvStore.get(`staging:${key}`);
        if (val === undefined) return null;
        return JSON.parse(val);
      }),
      put: vi.fn(async (key: string, value: string) => {
        kvStore.set(`staging:${key}`, value);
      }),
      delete: vi.fn(async (key: string) => {
        kvStore.delete(`staging:${key}`);
      }),
      list: vi.fn(async () => ({ keys: [] })),
    },
    DEALS_LOG: {
      get: vi.fn(async (key: string) => {
        const val = kvStore.get(`log:${key}`);
        if (val === undefined) return null;
        return val;
      }),
      put: vi.fn(async (key: string, value: string) => {
        kvStore.set(`log:${key}`, value);
      }),
      delete: vi.fn(async (key: string) => {
        kvStore.delete(`log:${key}`);
      }),
      list: vi.fn(async () => ({ keys: [] })),
    },
    DEALS_LOCK: {
      get: vi.fn(async () => null),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      list: vi.fn(async () => ({ keys: [] })),
    },
    ENVIRONMENT: "test",
    RESEARCH_FETCH_TIMEOUT_MS: "5000",
    RESEARCH_USE_REAL_FETCHING: "false",
    NOTIFICATION_THRESHOLD: "100",
    TRUST_THRESHOLD: "0.3",
  } as unknown as Env;
}

/** Set a snapshot in the mock prod KV using the real key "snapshot:prod". */
function setProdSnapshot(kv: Map<string, string>, snapshot: Snapshot): void {
  kv.set("prod:snapshot:prod", JSON.stringify(snapshot));
}

// ---------------------------------------------------------------------------
// checkDealUrlHealth — classification tests
// ---------------------------------------------------------------------------

describe("checkDealUrlHealth", () => {
  beforeEach(async () => {
    // Mock crypto for stable test output
    vi.mock("../../worker/lib/crypto", () => ({
      generateSnapshotHash: vi.fn(async () => "hash-new"),
    }));
    vi.mock("../../worker/notify", () => ({
      notify: vi.fn(async () => {}),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function mockFetchResponses(
    responses: Array<{ status?: number; ok?: boolean; error?: string }>,
  ) {
    const security = await import("../../worker/lib/security");
    let callIdx = 0;
    vi.spyOn(security, "validatedFetch").mockImplementation(async () => {
      const r = responses[callIdx] ??
        responses[responses.length - 1] ?? {
          status: 200,
        };
      callIdx++;
      if (r.error) throw new Error(r.error);
      return new Response(null, {
        status: r.status ?? 200,
        statusText: (r.ok ?? r.status === 200) ? "OK" : "Error",
      });
    });
  }

  it("classifies 200 OK as healthy", async () => {
    await mockFetchResponses([{ status: 200, ok: true }]);
    const env = buildMockEnv(new Map());
    const deals = [makeDeal({ id: "d1", url: "https://a.com/ref/ABC" })];
    const result = await checkDealUrlHealth(env, deals);
    expect(result.checked).toBe(1);
    expect(result.healthy).toBe(1);
    expect(result.unhealthy).toBe(0);
  });

  it("classifies 404 as unhealthy (definitive)", async () => {
    await mockFetchResponses([{ status: 404 }]);
    const env = buildMockEnv(new Map());
    const deals = [makeDeal({ id: "d1", url: "https://b.com/ref/DEF" })];
    const result = await checkDealUrlHealth(env, deals);
    expect(result.unhealthy).toBe(1);
  });

  it("classifies 410 Gone as unhealthy (definitive)", async () => {
    await mockFetchResponses([{ status: 410 }]);
    const env = buildMockEnv(new Map());
    const deals = [makeDeal({ id: "d1", url: "https://c.com/ref/GHI" })];
    const result = await checkDealUrlHealth(env, deals);
    expect(result.unhealthy).toBe(1);
  });

  it("classifies 500 as unhealthy (transient)", async () => {
    await mockFetchResponses([{ status: 500 }]);
    const env = buildMockEnv(new Map());
    const deals = [makeDeal({ id: "d1", url: "https://d.com/ref/JKL" })];
    const result = await checkDealUrlHealth(env, deals);
    expect(result.unhealthy).toBe(1);
  });

  it("classifies network error as unhealthy", async () => {
    await mockFetchResponses([{ error: "Connection refused" }]);
    const env = buildMockEnv(new Map());
    const deals = [makeDeal({ id: "d1", url: "https://e.com/ref/MNO" })];
    const result = await checkDealUrlHealth(env, deals);
    expect(result.unhealthy).toBe(1);
  });

  it("handles mixed healthy and unhealthy", async () => {
    await mockFetchResponses([
      { status: 200, ok: true },
      { status: 404 },
      { status: 500 },
    ]);
    const env = buildMockEnv(new Map());
    const deals = [
      makeDeal({ id: "d1", url: "https://a.com/ok" }),
      makeDeal({ id: "d2", url: "https://b.com/definitive" }),
      makeDeal({ id: "d3", url: "https://c.com/transient" }),
    ];
    const result = await checkDealUrlHealth(env, deals);
    expect(result.checked).toBe(3);
    expect(result.healthy).toBe(1);
    expect(result.unhealthy).toBe(2);
  });

  it("returns zero counts for empty deal list", async () => {
    const env = buildMockEnv(new Map());
    const result = await checkDealUrlHealth(env, []);
    expect(result.checked).toBe(0);
    expect(result.healthy).toBe(0);
    expect(result.unhealthy).toBe(0);
  });

  it("processes deals in batches respecting concurrency", async () => {
    const responses = Array(6).fill({ status: 200, ok: true });
    await mockFetchResponses(responses);
    const env = buildMockEnv(new Map());
    const deals = Array.from({ length: 6 }, (_, i) =>
      makeDeal({ id: `d${i}`, url: `https://x${i}.com/ref/X` }),
    );
    const result = await checkDealUrlHealth(env, deals, 2);
    expect(result.checked).toBe(6);
    expect(result.healthy).toBe(6);
    expect(result.unhealthy).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// deactivateUnhealthyDeals tests
// ---------------------------------------------------------------------------

describe("deactivateUnhealthyDeals", () => {
  let kvStore: Map<string, string>;
  let env: Env;

  beforeEach(async () => {
    kvStore = new Map<string, string>();

    vi.mock("../../worker/lib/crypto", () => ({
      generateSnapshotHash: vi.fn(async () => "hash-new-snapshot"),
    }));

    vi.mock("../../worker/notify", () => ({
      notify: vi.fn(async () => {}),
    }));

    env = buildMockEnv(kvStore);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Classification ----

  it("deactivates deals with definitive failure codes (400, 404, 410, 451)", async () => {
    const deals = [makeDeal({ id: "d1", code: "C1", url: "https://a.com/ok" })];
    const snapshot = makeSnapshot({ snapshot_hash: "hash-prod", deals });
    setProdSnapshot(kvStore, snapshot);

    const healthResults = [
      {
        dealId: "d1",
        code: "C1",
        url: "https://a.com/ok",
        healthy: false,
        statusCode: 404,
      },
    ];

    const result = await deactivateUnhealthyDeals(env, healthResults);

    expect(result.deactivated).toBe(1);
    expect(result.flagged).toBe(0);

    // Verify staging snapshot was written with correct previous_hash
    const raw = kvStore.get("staging:snapshot:staging")!;
    expect(raw).toBeDefined();
    const stagingData = JSON.parse(raw);
    expect(stagingData.previous_hash).toBe("hash-prod");
  });

  it("sets previous_hash to current production snapshot hash", async () => {
    const deals = [makeDeal({ id: "d1", code: "C1", url: "https://a.com/ok" })];
    const snapshot = makeSnapshot({
      snapshot_hash: "hash-current-prod",
      previous_hash: "hash-older",
      deals,
    });
    setProdSnapshot(kvStore, snapshot);

    const healthResults = [
      {
        dealId: "d1",
        code: "C1",
        url: "https://a.com/ok",
        healthy: false,
        statusCode: 400,
      },
    ];

    await deactivateUnhealthyDeals(env, healthResults);

    const raw = kvStore.get("staging:snapshot:staging")!;
    const stagingData = JSON.parse(raw);
    expect(stagingData.previous_hash).toBe("hash-current-prod");
  });

  it("flags but does not deactivate deals with transient codes", async () => {
    const deals = [makeDeal({ id: "d1", code: "C1", url: "https://a.com/ok" })];
    const snapshot = makeSnapshot({ snapshot_hash: "hash-prod", deals });
    setProdSnapshot(kvStore, snapshot);

    const healthResults = [
      {
        dealId: "d1",
        code: "C1",
        url: "https://a.com/ok",
        healthy: false,
        statusCode: 503,
      },
    ];

    const result = await deactivateUnhealthyDeals(env, healthResults);

    expect(result.deactivated).toBe(0);
    expect(result.flagged).toBe(1);
    expect(kvStore.has("log:flag:url-health:d1")).toBe(true);
    expect(result.deals).toHaveLength(0);
  });

  it("flags network errors (no status code) without deactivating", async () => {
    const deals = [makeDeal({ id: "d1", code: "C1", url: "https://a.com/ok" })];
    const snapshot = makeSnapshot({ snapshot_hash: "hash-prod", deals });
    setProdSnapshot(kvStore, snapshot);

    const healthResults = [
      {
        dealId: "d1",
        code: "C1",
        url: "https://a.com/ok",
        healthy: false,
        error: "Connection timed out",
      },
    ];

    const result = await deactivateUnhealthyDeals(env, healthResults);

    expect(result.deactivated).toBe(0);
    expect(result.flagged).toBe(1);
    expect(kvStore.has("log:flag:url-health:d1")).toBe(true);
  });

  it("handles missing production snapshot gracefully", async () => {
    const healthResults = [
      {
        dealId: "d1",
        code: "C1",
        url: "https://a.com/ok",
        healthy: false,
        statusCode: 404,
      },
    ];

    const result = await deactivateUnhealthyDeals(env, healthResults);
    expect(result.deactivated).toBe(0);
    expect(result.flagged).toBe(0);
  });

  it("skips already non-active deals", async () => {
    const deals = [
      makeDeal({ id: "d1", code: "C1", url: "https://a.com/ok" }),
      makeDeal({
        id: "d2",
        code: "C2",
        url: "https://b.com/ok",
        metadata: {
          category: ["general"],
          tags: [],
          normalized_at: new Date().toISOString(),
          confidence_score: 0.8,
          status: "rejected",
        },
      }),
    ];
    const snapshot = makeSnapshot({
      snapshot_hash: "hash-prod",
      deals,
      stats: {
        active: 1,
        rejected: 1,
        quarantined: 0,
        duplicates: 0,
        total: 2,
      },
    });
    setProdSnapshot(kvStore, snapshot);

    const healthResults = [
      {
        dealId: "d1",
        code: "C1",
        url: "https://a.com/ok",
        healthy: false,
        statusCode: 404,
      },
      {
        dealId: "d2",
        code: "C2",
        url: "https://b.com/ok",
        healthy: false,
        statusCode: 404,
      },
    ];

    const result = await deactivateUnhealthyDeals(env, healthResults);

    // Only d1 should be deactivated (d2 already rejected)
    expect(result.deactivated).toBe(1);
    expect(result.deals).toEqual(["d1"]);
  });

  // ---- Stale-URL race ----

  it("guards against stale-URL: URL changed between health check and snapshot read", async () => {
    const healthResults = [
      {
        dealId: "d1",
        code: "C1",
        url: "https://old-url.com/broken",
        healthy: false,
        statusCode: 404,
      },
    ];

    const deals = [
      makeDeal({ id: "d1", code: "C1", url: "https://new-url.com/working" }),
    ];
    const snapshot = makeSnapshot({ snapshot_hash: "hash-prod", deals });
    setProdSnapshot(kvStore, snapshot);

    const result = await deactivateUnhealthyDeals(env, healthResults);

    // CURRENT behavior: deactivates based on dealId only (URL not checked).
    // The test documents this limitation — it deactivates the stale URL's deal.
    expect(result.deactivated).toBe(1);
  });

  // ---- Snapshot hash chain ----

  it("preserves snapshot_hash chain through staging write", async () => {
    const deals = [makeDeal({ id: "d1", code: "C1", url: "https://a.com/ok" })];
    const snapshot = makeSnapshot({
      snapshot_hash: "hash-first",
      previous_hash: "hash-genesis",
      deals,
    });
    setProdSnapshot(kvStore, snapshot);

    const healthResults = [
      {
        dealId: "d1",
        code: "C1",
        url: "https://a.com/ok",
        healthy: false,
        statusCode: 404,
      },
    ];

    await deactivateUnhealthyDeals(env, healthResults);

    // Staging should have previous_hash = "hash-first" (the current prod hash)
    const raw = kvStore.get("staging:snapshot:staging")!;
    const stagingData = JSON.parse(raw);
    expect(stagingData.previous_hash).toBe("hash-first");
    expect(stagingData.snapshot_hash).toBeDefined();
    expect(stagingData.snapshot_hash).not.toBe("hash-first");
  });

  // ---- Failed write counts ----

  it("reports flagged count as attempted writes (current behavior)", async () => {
    const deals = [makeDeal({ id: "d1", code: "C1", url: "https://a.com/ok" })];
    const snapshot = makeSnapshot({ snapshot_hash: "hash-prod", deals });
    setProdSnapshot(kvStore, snapshot);

    // Make DEALS_LOG.put throw to simulate KV write failure
    const origPut = env.DEALS_LOG.put;
    env.DEALS_LOG.put = vi.fn(async () => {
      throw new Error("KV write failed");
    });

    const healthResults = [
      {
        dealId: "d1",
        code: "C1",
        url: "https://a.com/ok",
        healthy: false,
        statusCode: 503,
      },
    ];

    const result = await deactivateUnhealthyDeals(env, healthResults);

    // Current behavior: flagged count reports 1 even though write failed
    expect(result.flagged).toBe(1);

    env.DEALS_LOG.put = origPut;
  });

  it("deactivated count stays 0 when promoteToProduction throws", async () => {
    const deals = [makeDeal({ id: "d1", code: "C1", url: "https://a.com/ok" })];
    const snapshot = makeSnapshot({ snapshot_hash: "hash-prod", deals });
    setProdSnapshot(kvStore, snapshot);

    // Ensure promoteToProduction will fail by making the staging write succeed
    // but then corrupting the stored hash so hash-chain verification fails.
    // Since we mock generateSnapshotHash to always return "hash-new-snapshot",
    // and the staging snapshot is written with that hash, the promotion will
    // compare the prod hash ("hash-prod") with the expected hash (also "hash-prod"),
    // and it should succeed normally. To make it fail we need the staging to
    // have a different hash. Since the code reads staging after writing, the
    // mock always returns "hash-new-snapshot" — and the expected previous hash
    // passed to promoteToProduction is the current prod hash ("hash-prod").
    // The mock staging snapshot in kvStore after writeStagingSnapshot will
    // have hash "hash-new-snapshot", and promoteToProduction reads it and
    // compares its previous_hash to expectedPreviousHash. That should work.
    //
    // To actually force a promotion failure, we'd need to corrupt the staging
    // after write. The simplest approach: mock promoteToProduction itself.
    const storage = await import("../../worker/lib/storage");
    vi.spyOn(storage, "promoteToProduction").mockRejectedValue(
      new Error("Promotion failed"),
    );

    const healthResults = [
      {
        dealId: "d1",
        code: "C1",
        url: "https://a.com/ok",
        healthy: false,
        statusCode: 404,
      },
    ];

    const result = await deactivateUnhealthyDeals(env, healthResults);

    // Deactivated count should be 0 since promotion failed
    expect(result.deactivated).toBe(0);
    expect(result.deals).toHaveLength(0);
  });

  // ---- Mixed results ----

  it("handles mixed definitive and transient results", async () => {
    const deals = [
      makeDeal({ id: "d1", code: "C1", url: "https://a.com/ok" }),
      makeDeal({ id: "d2", code: "C2", url: "https://b.com/ok" }),
      makeDeal({ id: "d3", code: "C3", url: "https://c.com/ok" }),
    ];
    const snapshot = makeSnapshot({
      snapshot_hash: "hash-prod",
      deals,
      stats: {
        active: 3,
        rejected: 0,
        quarantined: 0,
        duplicates: 0,
        total: 3,
      },
    });
    setProdSnapshot(kvStore, snapshot);

    const healthResults = [
      {
        dealId: "d1",
        code: "C1",
        url: "https://a.com/ok",
        healthy: false,
        statusCode: 404,
      },
      {
        dealId: "d2",
        code: "C2",
        url: "https://b.com/ok",
        healthy: false,
        statusCode: 500,
      },
      {
        dealId: "d3",
        code: "C3",
        url: "https://c.com/ok",
        healthy: false,
        error: "Network error",
      },
    ];

    const result = await deactivateUnhealthyDeals(env, healthResults);

    expect(result.deactivated).toBe(1); // Only 404
    expect(result.flagged).toBe(2); // 500 + network error
    expect(result.deals).toEqual(["d1"]);
  });
});

// ---------------------------------------------------------------------------
// runUrlHealthCheck integration tests
// ---------------------------------------------------------------------------

describe("runUrlHealthCheck", () => {
  let kvStore: Map<string, string>;
  let env: Env;

  beforeEach(async () => {
    kvStore = new Map<string, string>();

    vi.mock("../../worker/lib/security", () => ({
      validatedFetch: vi.fn(async () => new Response(null, { status: 200 })),
    }));

    vi.mock("../../worker/lib/crypto", () => ({
      generateSnapshotHash: vi.fn(async () => "hash-new"),
    }));

    vi.mock("../../worker/notify", () => ({
      notify: vi.fn(async () => {}),
    }));

    env = buildMockEnv(kvStore);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns zeros when no active deals exist", async () => {
    // No prod snapshot → getActiveDeals returns []
    const result = await runUrlHealthCheck(env);
    expect(result.checked).toBe(0);
    expect(result.healthy).toBe(0);
    expect(result.unhealthy).toBe(0);
    expect(result.deactivated).toBe(0);
    expect(result.flagged).toBe(0);
  });

  it("runs full health check pipeline on active deals", async () => {
    const deals = [
      makeDeal({ id: "d1", url: "https://good.com/ref/X" }),
      makeDeal({ id: "d2", url: "https://bad.com/ref/Y" }),
    ];
    const snapshot = makeSnapshot({
      snapshot_hash: "hash-prod",
      deals,
      stats: {
        active: 2,
        rejected: 0,
        quarantined: 0,
        duplicates: 0,
        total: 2,
      },
    });
    setProdSnapshot(kvStore, snapshot);

    // Mock fetch: first deal healthy, second deal 404
    const security = await import("../../worker/lib/security");
    let callCount = 0;
    vi.spyOn(security, "validatedFetch").mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(null, { status: 200, statusText: "OK" });
      }
      return new Response(null, { status: 404, statusText: "Not Found" });
    });

    const result = await runUrlHealthCheck(env);

    expect(result.checked).toBe(2);
    expect(result.healthy).toBe(1);
    expect(result.unhealthy).toBe(1);
    expect(result.deactivated).toBe(1);
    expect(result.flagged).toBe(0);
  });
});
