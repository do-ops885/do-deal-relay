import { describe, it, expect, vi } from "vitest";
import { generateAnalyticsSummary } from "../../worker/lib/analytics";
import type { Env } from "../../worker/types";

describe("Analytics Module", () => {
  it("should generate analytics summary", async () => {
    const mockEnv = {
      DEALS_PROD: {
        get: vi.fn().mockResolvedValue(JSON.stringify({
          deals: [],
          generated_at: new Date().toISOString()
        }))
      },
      DEALS_LOG: {
        get: vi.fn().mockResolvedValue(JSON.stringify([]))
      }
    } as unknown as Env;

    const summary = await generateAnalyticsSummary(mockEnv);
    expect(summary).toBeDefined();
    expect(summary.totalActiveDeals).toBe(0);
  });
});
