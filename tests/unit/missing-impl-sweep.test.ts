import { describe, it, expect, vi } from "vitest";
import {
  mirrorStageToDO,
  mirrorPublishToDO,
  mirrorTrustToDO,
} from "../../worker/lib/do-mirror";
import {
  matchesSemanticFilters,
  describeSemanticFilters,
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

  it("describes applied filters", () => {
    expect(
      describeSemanticFilters({ domain: "x.com", min_reward: 10 }),
    ).toContain("domain=x.com");
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
  it("bulk handlers are functions", () => {
    expect(typeof handleBulkImport).toBe("function");
    expect(typeof handleBulkExport).toBe("function");
  });

  it("dashboard handlers return responses with mocked D1", async () => {
    const env = mockEnv({
      DEALS_DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [] }),
            first: vi.fn().mockResolvedValue(null),
          })),
          all: vi.fn().mockResolvedValue({ results: [] }),
        })),
      },
    });
    const stats = await handleDashboardStats(env);
    const activity = await handleDashboardRecentActivity(env);
    const health = await handleDashboardSystemHealth(env);
    expect(stats.status).toBe(200);
    expect(activity.status).toBe(200);
    expect(health.status).toBe(200);
  });
});

describe("email worker entrypoint", () => {
  it("exposes email handler on default export", () => {
    expect(typeof (workerDefault as unknown as { email: unknown }).email).toBe(
      "function",
    );
  });
});
