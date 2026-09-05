import { describe, it, expect, vi } from "vitest";
import {
  mirrorStageToDO,
  mirrorPublishToDO,
  mirrorTrustToDO,
} from "../../worker/lib/do-mirror";
import {
  matchesSemanticFilters,
  describeSemanticFilters,
  handleSemanticSearch,
} from "../../worker/routes/semantic-search";
import { getTools, executeTool } from "../../worker/lib/mcp/tools/index";
import { handleBulkImport } from "../../worker/routes/bulk/import";
import { handleBulkExport } from "../../worker/routes/bulk/export";
import {
  handleDashboardStats,
  handleDashboardRecentActivity,
  handleDashboardSystemHealth,
} from "../../worker/routes/dashboard";
import workerDefault from "../../worker/index";

function mockEnv(overrides: Record<string, unknown> = {}) {
  return {
    DEALS_PROD: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    },
    DEALS_DB: {
      exec: vi.fn().mockResolvedValue(undefined),
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          run: vi.fn().mockResolvedValue(undefined),
          all: vi.fn().mockResolvedValue({ results: [] }),
        })),
      })),
    },
    ...overrides,
  } as unknown as import("../../worker/types").Env;
}

describe("do-mirror best-effort wiring", () => {
  it("stages + validates via DealRegistry stub", async () => {
    const stageDeals = vi.fn().mockResolvedValue(2);
    const validateDeals = vi.fn().mockResolvedValue(1);
    const env = mockEnv({
      DEAL_REGISTRY: {
        idFromName: vi.fn().mockReturnValue({}),
        get: vi.fn().mockReturnValue({ stageDeals, validateDeals }),
      },
    });
    await mirrorStageToDO(env, [
      {
        id: "d1",
        source: { domain: "example.com" },
        title: "t",
        metadata: { status: "active" },
      },
      {
        id: "d2",
        source: { domain: "example.com" },
        title: "t2",
        metadata: { status: "rejected" },
      },
    ] as never);
    expect(stageDeals).toHaveBeenCalledTimes(1);
    expect(validateDeals).toHaveBeenCalledWith(["d1"]);
  });

  it("never throws when DO is missing or rejects", async () => {
    await expect(mirrorStageToDO(mockEnv(), [])).resolves.toBeUndefined();
    const env = mockEnv({
      DEAL_REGISTRY: {
        idFromName: vi.fn().mockReturnValue({}),
        get: vi.fn().mockReturnValue({
          stageDeals: vi.fn().mockRejectedValue(new Error("boom")),
          validateDeals: vi.fn(),
        }),
      },
    });
    await expect(
      mirrorStageToDO(env, [
        {
          id: "d",
          source: { domain: "x" },
          title: "t",
          metadata: { status: "active" },
        },
      ] as never),
    ).resolves.toBeUndefined();
    await expect(mirrorPublishToDO(env, ["d"])).resolves.toBeUndefined();
  });

  it("publishes via DealRegistry stub", async () => {
    const publishDeals = vi.fn().mockResolvedValue(1);
    const env = mockEnv({
      DEAL_REGISTRY: {
        idFromName: vi.fn().mockReturnValue({}),
        get: vi.fn().mockReturnValue({ publishDeals }),
      },
    });
    await mirrorPublishToDO(env, ["d1"]);
    expect(publishDeals).toHaveBeenCalledWith(["d1"]);
  });

  it("ignores DO stubs that fail the runtime method guard", async () => {
    const stageDeals = vi.fn().mockResolvedValue(1);
    const env = mockEnv({
      DEAL_REGISTRY: {
        idFromName: vi.fn().mockReturnValue({}),
        get: vi.fn().mockReturnValue({ stageDeals }), // validateDeals missing
      },
      SOURCE_REGISTRY: {
        idFromName: vi.fn().mockReturnValue({}),
        get: vi.fn().mockReturnValue({ evolveTrust: "not-a-function" }),
      },
    });
    await expect(
      mirrorStageToDO(env, [
        {
          id: "d1",
          source: { domain: "example.com" },
          title: "t",
          metadata: { status: "active" },
        },
      ] as never),
    ).resolves.toBeUndefined();
    expect(stageDeals).not.toHaveBeenCalled();
    await expect(mirrorPublishToDO(env, ["d1"])).resolves.toBeUndefined();
    await expect(
      mirrorTrustToDO(env, new Map([["example.com", true]])),
    ).resolves.toBeUndefined();
  });

  it("mirrors trust capped and isolated per-domain", async () => {
    const evolveTrust = vi.fn().mockResolvedValue(0.6);
    const env = mockEnv({
      SOURCE_REGISTRY: {
        idFromName: vi.fn().mockReturnValue({}),
        get: vi.fn().mockReturnValue({ evolveTrust }),
      },
    });
    const outcomes = new Map(
      Array.from(
        { length: 15 },
        (_, i) => [`d${i}.com`, true] as [string, boolean],
      ),
    );
    await mirrorTrustToDO(env, outcomes);
    expect(evolveTrust).toHaveBeenCalledTimes(10);
  });
});

describe("semantic-search filters", () => {
  it("matches domain/category/status/tags", () => {
    expect(
      matchesSemanticFilters(
        { domain: "Example.COM" },
        { domain: "example.com" },
      ),
    ).toBe(true);
    expect(
      matchesSemanticFilters(
        { domain: "other.com" },
        { domain: "example.com" },
      ),
    ).toBe(false);
    expect(
      matchesSemanticFilters(
        { category: ["Trading"] },
        { category: "trading" },
      ),
    ).toBe(true);
    expect(
      matchesSemanticFilters({ status: "active" }, { status: "active" }),
    ).toBe(true);
    expect(
      matchesSemanticFilters(
        { tags: ["bonus", "invite"] },
        { tags: ["Bonus"] },
      ),
    ).toBe(true);
    expect(
      matchesSemanticFilters(
        { tags: ["bonus"] },
        { tags: ["bonus", "missing"] },
      ),
    ).toBe(false);
    expect(matchesSemanticFilters(undefined, undefined)).toBe(true);
  });

  it("describes applied filters incl. the D1-backed min_reward", () => {
    const described = describeSemanticFilters({
      domain: "x.com",
      min_reward: 10,
    });
    expect(described).toContain("domain=x.com");
    expect(described).toContain("min_reward=10");
    expect(described.some((d) => d.includes("unsupported"))).toBe(false);
  });

  it("rejects min_reward on the pure vector path (no D1 values)", async () => {
    const env = mockEnv({
      AI: { run: vi.fn() },
      DEAL_EMBEDDINGS: {
        query: vi.fn().mockResolvedValue({ matches: [] }),
      },
    });
    const request = new Request("https://example.com/api/semantic-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "cash bonus",
        filters: { min_reward: 50 },
      }),
    });
    const response = await handleSemanticSearch(request, env);
    expect(response.status).toBe(400);
  });
});

describe("mcp progress tools registered", () => {
  it("exposes check/cancel/list tools", () => {
    const names = getTools().map((t) => t.name);
    expect(names).toContain("check_progress");
    expect(names).toContain("cancel_operation");
    expect(names).toContain("list_operations");
  });

  it("list_operations returns empty list with mocked env", async () => {
    const result = await executeTool(
      "list_operations",
      {},
      mockEnv(),
      new Request("https://example.com/mcp"),
    );
    expect(result.isError).not.toBe(true);
  });

  it("check_progress without id lists operations", async () => {
    const result = await executeTool(
      "check_progress",
      {},
      mockEnv(),
      new Request("https://example.com/mcp"),
    );
    expect(result.isError).not.toBe(true);
  });
});

describe("bulk + dashboard handlers wired", () => {
  it("bulk import writes a validated referral through storage", async () => {
    expect(typeof handleBulkImport).toBe("function");
    expect(typeof handleBulkExport).toBe("function");

    const putFn = vi.fn().mockResolvedValue(undefined);
    const env = mockEnv({
      DEALS_SOURCES: {
        get: vi.fn().mockResolvedValue(null),
        put: putFn,
      },
    });
    const request = new Request("http://localhost/api/bulk/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deals: [
          {
            code: "WIRE1",
            url: "https://wire.example.com/invite/WIRE1",
            domain: "wire.example.com",
          },
        ],
      }),
    });
    const response = await handleBulkImport(request, env);
    const body = (await response.json()) as {
      success: boolean;
      total: number;
      imported: number;
      failed: number;
      skipped: number;
      results: Array<{
        success: boolean;
        code: string;
        message: string;
        referral_id: string | null;
        errors: string[] | null;
      }>;
    };
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.total).toBe(1);
    expect(body.imported).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.skipped).toBe(0);
    expect(body.results[0]?.success).toBe(true);
    expect(body.results[0]?.message).toBe("created");
    expect(body.results[0]?.referral_id).toBeTruthy();

    // Assert the actual write: a referral:input:<id> KV entry whose payload
    // matches the normalized referral schema.
    const inputPuts = putFn.mock.calls.filter(
      ([key]) => typeof key === "string" && key.startsWith("referral:input:"),
    );
    expect(inputPuts).toHaveLength(1);
    const written = JSON.parse(inputPuts[0]?.[1] as string) as {
      code: string;
      domain: string;
      url: string;
      status: string;
      metadata: { title: string };
    };
    expect(written.code).toBe("WIRE1");
    expect(written.domain).toBe("wire.example.com");
    expect(written.url).toBe("https://wire.example.com/invite/WIRE1");
    expect(written.status).toBe("quarantined");
    expect(written.metadata?.title).toBe("wire.example.com Referral");
  });

  it("dashboard handlers return computed schema bodies", async () => {
    const now = Date.now();
    const inWindow = new Date(now).toISOString();
    const tooOld = new Date(now - 48 * 60 * 60 * 1000).toISOString();
    const env = mockEnv({
      DEALS_DB: {
        prepare: vi.fn(() => ({
          all: vi.fn().mockResolvedValue({
            results: [
              { status: "active", count: 4 },
              { status: "quarantined", count: 1 },
              { status: "rejected", count: 2 },
            ],
          }),
          first: vi.fn().mockResolvedValue({}),
        })),
      },
      DEALS_STAGING: { get: vi.fn() },
      DEALS_LOG: {
        get: vi.fn(),
        list: vi.fn().mockResolvedValue({
          keys: [
            {
              name: "run-final",
              metadata: JSON.stringify({
                ts: inWindow,
                phase: "finalize",
                candidate_count: 10,
              }),
            },
            {
              name: "run-error",
              metadata: JSON.stringify({ ts: inWindow, status: "error" }),
            },
            {
              name: "run-too-old",
              metadata: JSON.stringify({
                ts: tooOld,
                phase: "finalize",
                candidate_count: 99,
              }),
            },
          ],
          list_complete: true,
        }),
      },
      DEALS_LOCK: { get: vi.fn() },
      DEALS_SOURCES: { get: vi.fn() },
    });

    const statsResponse = await handleDashboardStats(env);
    expect(statsResponse.status).toBe(200);
    const statsBody = (await statsResponse.json()) as {
      stats: {
        total: number;
        active: number;
        quarantined: number;
        rejected: number;
      };
      recentActivity: { runs: number; dealsFound: number; errors: number };
      systemHealth: { status: string; checks: Record<string, boolean> };
      timestamp: string;
    };
    expect(statsBody.stats).toEqual({
      total: 7,
      active: 4,
      quarantined: 1,
      rejected: 2,
    });
    expect(statsBody.recentActivity).toEqual({
      runs: 1,
      dealsFound: 10,
      errors: 1,
    });
    expect(statsBody.systemHealth.status).toBe("healthy");
    expect(typeof statsBody.timestamp).toBe("string");

    const activityResponse = await handleDashboardRecentActivity(env);
    expect(activityResponse.status).toBe(200);
    const activityBody = (await activityResponse.json()) as {
      runs: number;
      dealsFound: number;
      errors: number;
    };
    expect(activityBody).toEqual({ runs: 1, dealsFound: 10, errors: 1 });

    const healthResponse = await handleDashboardSystemHealth(env);
    expect(healthResponse.status).toBe(200);
    const healthBody = (await healthResponse.json()) as {
      status: string;
      checks: Record<string, boolean>;
    };
    expect(healthBody.status).toBe("healthy");
    expect(healthBody.checks.d1_connection).toBe(true);
    expect(healthBody.checks.DEALS_PROD).toBe(true);
  });
});

describe("email worker entrypoint", () => {
  it("exposes email handler on default export", () => {
    expect(typeof (workerDefault as unknown as { email: unknown }).email).toBe(
      "function",
    );
  });
});
