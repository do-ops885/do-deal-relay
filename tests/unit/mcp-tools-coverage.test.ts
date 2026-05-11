import { describe, it, expect, vi } from "vitest";
import { dealToolHandlers } from "../../worker/lib/mcp/tools/deals";
import { systemToolHandlers } from "../../worker/lib/mcp/tools/system";
import { userToolHandlers } from "../../worker/lib/mcp/tools/user";
import type { Env } from "../../worker/types";

// Mock handlers
vi.mock("../../worker/lib/mcp/handlers/search", () => ({
  handleSearchDeals: vi.fn().mockResolvedValue({ deals: [], total: 0 }),
  SearchDealsInputSchema: { parse: (v: any) => v },
}));

vi.mock("../../worker/lib/mcp/handlers/referrals", () => ({
  handleGetDeal: vi.fn().mockResolvedValue({ code: "TEST" }),
  handleAddReferral: vi.fn().mockResolvedValue({ success: true }),
  GetDealInputSchema: { parse: (v: any) => v },
  AddReferralInputSchema: { parse: (v: any) => v },
}));

vi.mock("../../worker/lib/mcp/handlers/stats", () => ({
  handleGetStats: vi.fn().mockResolvedValue({ totalActiveDeals: 10 }),
}));

vi.mock("../../worker/lib/mcp/handlers/pipeline", () => ({
  handleGetPipelineStatus: vi.fn().mockResolvedValue({ locked: false }),
  handleTriggerDiscovery: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("../../worker/lib/mcp/handlers/discovery", () => ({
  handleGetSimilarDeals: vi.fn().mockResolvedValue({ similar: [] }),
  handleGetDealHighlights: vi.fn().mockResolvedValue({ top_deals: [] }),
  GetSimilarDealsInputSchema: { parse: (v: any) => v },
}));

vi.mock("../../worker/lib/mcp/handlers/logging", () => ({
  handleGetLogs: vi.fn().mockResolvedValue({ logs: [] }),
  GetLogsInputSchema: { parse: (v: any) => v },
}));

vi.mock("../../worker/lib/mcp/handlers/experience", () => ({
  handleExperienceDeal: vi.fn().mockResolvedValue({ success: true }),
  ExperienceDealInputSchema: { parse: (v: any) => v },
}));

vi.mock("../../worker/lib/mcp/handlers/report", () => ({
  handleReportDeal: vi.fn().mockResolvedValue({ success: true }),
  ReportDealInputSchema: { parse: (v: any) => v },
}));

vi.mock("../../worker/lib/mcp/handlers/nlq", () => ({
  handleNaturalLanguageQuery: vi.fn().mockResolvedValue({ success: true }),
  NaturalLanguageQueryInputSchema: { parse: (v: any) => v },
}));

describe("MCP Tool Handlers Coverage", () => {
  const mockEnv = {} as Env;

  it("should cover dealToolHandlers", async () => {
    const { handleSearchDeals } =
      await import("../../worker/lib/mcp/handlers/search");
    const { handleGetDeal, handleAddReferral } =
      await import("../../worker/lib/mcp/handlers/referrals");

    await dealToolHandlers.search_deals({}, mockEnv);
    expect(handleSearchDeals).toHaveBeenCalled();

    await dealToolHandlers.get_deal({ code: "C" }, mockEnv);
    expect(handleGetDeal).toHaveBeenCalled();

    await dealToolHandlers.add_referral(
      { code: "C", url: "U", domain: "D" },
      mockEnv,
    );
    expect(handleAddReferral).toHaveBeenCalled();
  });

  it("should cover systemToolHandlers", async () => {
    const { handleGetStats } =
      await import("../../worker/lib/mcp/handlers/stats");
    const { handleGetPipelineStatus, handleTriggerDiscovery } =
      await import("../../worker/lib/mcp/handlers/pipeline");
    const { handleGetSimilarDeals, handleGetDealHighlights } =
      await import("../../worker/lib/mcp/handlers/discovery");
    const { handleGetLogs } =
      await import("../../worker/lib/mcp/handlers/logging");

    await systemToolHandlers.get_stats({}, mockEnv);
    expect(handleGetStats).toHaveBeenCalled();

    await systemToolHandlers.get_pipeline_status({}, mockEnv);
    expect(handleGetPipelineStatus).toHaveBeenCalled();

    await systemToolHandlers.trigger_discovery({}, mockEnv);
    expect(handleTriggerDiscovery).toHaveBeenCalled();

    await systemToolHandlers.get_similar_deals({}, mockEnv);
    expect(handleGetSimilarDeals).toHaveBeenCalled();

    await systemToolHandlers.get_deal_highlights({}, mockEnv);
    expect(handleGetDealHighlights).toHaveBeenCalled();

    await systemToolHandlers.get_logs({}, mockEnv);
    expect(handleGetLogs).toHaveBeenCalled();
  });

  it("should cover userToolHandlers", async () => {
    const { handleExperienceDeal } =
      await import("../../worker/lib/mcp/handlers/experience");
    const { handleReportDeal } =
      await import("../../worker/lib/mcp/handlers/report");
    const { handleNaturalLanguageQuery } =
      await import("../../worker/lib/mcp/handlers/nlq");

    await userToolHandlers.natural_language_query({ query: "Q" }, mockEnv);
    expect(handleNaturalLanguageQuery).toHaveBeenCalled();

    await userToolHandlers.experience_deal(
      { code: "C", success: true },
      mockEnv,
    );
    expect(handleExperienceDeal).toHaveBeenCalled();

    await userToolHandlers.report_deal(
      { code: "C", reason: "broken" },
      mockEnv,
    );
    expect(handleReportDeal).toHaveBeenCalled();
  });
});
