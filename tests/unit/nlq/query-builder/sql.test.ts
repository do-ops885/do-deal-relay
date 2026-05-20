import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildWhereClause,
  buildOrderByClause,
} from "../../../../worker/lib/nlq/query-builder/sql";
import type { StructuredQuery } from "../../../../worker/lib/nlq/types";

function createBaseQuery(
  overrides: Partial<StructuredQuery> = {},
): StructuredQuery {
  return {
    textQuery: "test",
    filters: [],
    status: "active",
    includeExpired: false,
    sortBy: "relevance",
    sortOrder: "desc",
    limit: 20,
    offset: 0,
    ...overrides,
  };
}

describe("buildWhereClause", () => {
  let query: StructuredQuery;

  beforeEach(() => {
    query = createBaseQuery();
  });

  describe("status filter", () => {
    it("should add status condition when status is active", () => {
      const result = buildWhereClause(createBaseQuery({ status: "active" }));
      expect(result.whereClauses).toContain("d.status = ?");
      expect(result.params).toContain("active");
    });

    it("should add status condition when status is quarantined", () => {
      const result = buildWhereClause(
        createBaseQuery({ status: "quarantined" }),
      );
      expect(result.whereClauses).toContain("d.status = ?");
      expect(result.params).toContain("quarantined");
    });

    it("should add status condition when status is rejected", () => {
      const result = buildWhereClause(createBaseQuery({ status: "rejected" }));
      expect(result.whereClauses).toContain("d.status = ?");
      expect(result.params).toContain("rejected");
    });

    it("should use is_active when status is all", () => {
      const result = buildWhereClause(createBaseQuery({ status: "all" }));
      expect(result.whereClauses).toContain("d.is_active = 1");
      expect(result.params).not.toContain("all");
    });

    it("should use is_active when status is undefined", () => {
      const result = buildWhereClause(createBaseQuery({ status: undefined }));
      expect(result.whereClauses).toContain("d.is_active = 1");
    });
  });

  describe("expiry filter", () => {
    it("should add expiry condition by default", () => {
      const result = buildWhereClause(
        createBaseQuery({ includeExpired: false }),
      );
      const expiryClause = result.whereClauses.find((c) =>
        c.includes("expiry_date"),
      );
      expect(expiryClause).toBeDefined();
    });

    it("should skip expiry condition when includeExpired is true", () => {
      const result = buildWhereClause(
        createBaseQuery({ includeExpired: true }),
      );
      const expiryClause = result.whereClauses.find((c) =>
        c.includes("expiry_date"),
      );
      expect(expiryClause).toBeUndefined();
    });
  });

  describe("category filter", () => {
    it("should add JSON extraction condition for categories", () => {
      const result = buildWhereClause(
        createBaseQuery({ categories: ["trading", "crypto"] }),
      );
      const categoryClause = result.whereClauses.find((c) =>
        c.includes("json_extract"),
      );
      expect(categoryClause).toBeDefined();
      expect(categoryClause).toContain("OR");
      expect(result.params).toEqual(
        expect.arrayContaining(['%"trading"%', '%"crypto"%']),
      );
    });

    it("should not add category condition when categories is empty", () => {
      const result = buildWhereClause(createBaseQuery({ categories: [] }));
      const categoryClause = result.whereClauses.find((c) =>
        c.includes("json_extract"),
      );
      expect(categoryClause).toBeUndefined();
    });

    it("should not add category condition when categories is undefined", () => {
      const result = buildWhereClause(
        createBaseQuery({ categories: undefined }),
      );
      const categoryClause = result.whereClauses.find((c) =>
        c.includes("json_extract"),
      );
      expect(categoryClause).toBeUndefined();
    });

    it("should wrap multiple categories in parentheses", () => {
      const result = buildWhereClause(
        createBaseQuery({ categories: ["trading", "crypto", "banking"] }),
      );
      const categoryClause = result.whereClauses.find((c) =>
        c.includes("json_extract"),
      );
      expect(categoryClause).toMatch(/^\(.*\)$/);
      const orCount = (categoryClause!.match(/OR/g) || []).length;
      expect(orCount).toBe(2);
    });
  });

  describe("domain filter", () => {
    it("should add domain IN condition", () => {
      const result = buildWhereClause(
        createBaseQuery({ domains: ["example.com", "test.io"] }),
      );
      const domainClause = result.whereClauses.find((c) =>
        c.includes("d.domain IN"),
      );
      expect(domainClause).toBeDefined();
      expect(result.params).toContain("example.com");
      expect(result.params).toContain("test.io");
    });

    it("should generate correct number of placeholders for domains", () => {
      const result = buildWhereClause(
        createBaseQuery({ domains: ["a.com", "b.com", "c.com"] }),
      );
      const domainClause = result.whereClauses.find((c) =>
        c.includes("d.domain IN"),
      );
      const qmarkCount = (domainClause!.match(/\?/g) || []).length;
      expect(qmarkCount).toBe(3);
    });

    it("should skip domain condition when domains is undefined", () => {
      const result = buildWhereClause(createBaseQuery({ domains: undefined }));
      const domainClause = result.whereClauses.find((c) =>
        c.includes("d.domain IN"),
      );
      expect(domainClause).toBeUndefined();
    });

    it("should skip domain condition when domains is empty", () => {
      const result = buildWhereClause(createBaseQuery({ domains: [] }));
      const domainClause = result.whereClauses.find((c) =>
        c.includes("d.domain IN"),
      );
      expect(domainClause).toBeUndefined();
    });
  });

  describe("reward type filter", () => {
    it("should add reward_type IN condition", () => {
      const result = buildWhereClause(
        createBaseQuery({ rewardTypes: ["cash", "credit"] }),
      );
      const rewardClause = result.whereClauses.find((c) =>
        c.includes("d.reward_type IN"),
      );
      expect(rewardClause).toBeDefined();
      expect(result.params).toContain("cash");
      expect(result.params).toContain("credit");
    });

    it("should skip reward type condition when undefined", () => {
      const result = buildWhereClause(
        createBaseQuery({ rewardTypes: undefined }),
      );
      const rewardClause = result.whereClauses.find((c) =>
        c.includes("d.reward_type IN"),
      );
      expect(rewardClause).toBeUndefined();
    });

    it("should generate correct placeholders for reward types", () => {
      const result = buildWhereClause(
        createBaseQuery({ rewardTypes: ["cash", "percent", "item"] }),
      );
      const rewardClause = result.whereClauses.find((c) =>
        c.includes("d.reward_type IN"),
      );
      const qmarkCount = (rewardClause!.match(/\?/g) || []).length;
      expect(qmarkCount).toBe(3);
    });
  });

  describe("reward value filters", () => {
    it("should add min reward value condition", () => {
      const result = buildWhereClause(createBaseQuery({ minRewardValue: 50 }));
      expect(result.whereClauses).toContain("d.reward_value >= ?");
      expect(result.params).toContain(50);
    });

    it("should add max reward value condition when different from min", () => {
      const result = buildWhereClause(
        createBaseQuery({ minRewardValue: 50, maxRewardValue: 200 }),
      );
      expect(result.whereClauses).toContain("d.reward_value >= ?");
      expect(result.whereClauses).toContain("d.reward_value <= ?");
      expect(result.params).toContain(50);
      expect(result.params).toContain(200);
    });

    it("should skip max reward value when equal to min", () => {
      const result = buildWhereClause(
        createBaseQuery({ minRewardValue: 100, maxRewardValue: 100 }),
      );
      expect(result.whereClauses).toContain("d.reward_value >= ?");
      expect(result.whereClauses).not.toContain("d.reward_value <= ?");
    });

    it("should skip min reward value when undefined", () => {
      const result = buildWhereClause(
        createBaseQuery({ minRewardValue: undefined, maxRewardValue: 200 }),
      );
      expect(result.whereClauses).not.toContain("d.reward_value >= ?");
      expect(result.whereClauses).toContain("d.reward_value <= ?");
    });

    it("should skip both when undefined", () => {
      const result = buildWhereClause(
        createBaseQuery({
          minRewardValue: undefined,
          maxRewardValue: undefined,
        }),
      );
      expect(result.whereClauses).not.toContain("d.reward_value");
    });
  });

  describe("expiry_days filter", () => {
    it("should add expiry_days condition from filters", () => {
      const result = buildWhereClause(
        createBaseQuery({
          filters: [{ field: "expiry_days", operator: "lte", value: 7 }],
        }),
      );
      const expiryDaysClause = result.whereClauses.find((c) =>
        c.includes("expiry_date"),
      );
      expect(expiryDaysClause).toBeDefined();
      expect(result.params).toContain(7);
    });

    it("should ignore non-expiry_days filters", () => {
      const result = buildWhereClause(
        createBaseQuery({
          filters: [{ field: "reward_value", operator: "gte", value: 50 }],
        }),
      );
      const totalClauses = result.whereClauses.filter((c) =>
        c.includes("expiry"),
      );
      expect(totalClauses).toHaveLength(1);
    });

    it("should ignore expiry_days filter with non-number value", () => {
      const result = buildWhereClause(
        createBaseQuery({
          filters: [
            { field: "expiry_days", operator: "lte", value: "soon" as any },
          ],
        }),
      );
      const expiryClauses = result.whereClauses.filter((c) =>
        c.includes("datetime('now', '+"),
      );
      expect(expiryClauses).toHaveLength(0);
    });
  });

  describe("combined filters", () => {
    it("should combine status, category, domain, and reward filters", () => {
      const result = buildWhereClause(
        createBaseQuery({
          status: "active",
          categories: ["trading"],
          domains: ["example.com"],
          rewardTypes: ["cash"],
          minRewardValue: 50,
          maxRewardValue: 200,
        }),
      );
      expect(result.whereClauses).toContain("d.status = ?");
      expect(result.whereClauses.some((c) => c.includes("json_extract"))).toBe(
        true,
      );
      expect(result.whereClauses.some((c) => c.includes("d.domain IN"))).toBe(
        true,
      );
      expect(
        result.whereClauses.some((c) => c.includes("d.reward_type IN")),
      ).toBe(true);
      expect(result.whereClauses).toContain("d.reward_value >= ?");
      expect(result.whereClauses).toContain("d.reward_value <= ?");
    });

    it("should produce params in correct order", () => {
      const result = buildWhereClause(
        createBaseQuery({
          status: "active",
          categories: ["trading"],
          domains: ["example.com"],
          rewardTypes: ["cash"],
          minRewardValue: 50,
        }),
      );
      expect(result.params[0]).toBe("active");
      const activeIdx = result.params.indexOf("active");
      const tradingIdx = result.params.indexOf('%"trading"%');
      const domainIdx = result.params.indexOf("example.com");
      const cashIdx = result.params.indexOf("cash");
      const minIdx = result.params.indexOf(50);
      expect(activeIdx).toBeGreaterThanOrEqual(0);
      expect(tradingIdx).toBeGreaterThan(activeIdx);
      expect(domainIdx).toBeGreaterThan(tradingIdx);
      expect(cashIdx).toBeGreaterThan(domainIdx);
      expect(minIdx).toBeGreaterThan(cashIdx);
    });
  });

  describe("no filters", () => {
    it("should return only default conditions", () => {
      const result = buildWhereClause(
        createBaseQuery({
          status: "all",
          includeExpired: true,
          categories: undefined,
          domains: undefined,
          rewardTypes: undefined,
          minRewardValue: undefined,
          maxRewardValue: undefined,
          filters: [],
        }),
      );
      expect(result.whereClauses).toEqual(["d.is_active = 1"]);
      expect(result.params).toEqual([]);
    });

    it("should return default conditions when minimal query provided", () => {
      const minimal: StructuredQuery = {
        textQuery: undefined,
        filters: [],
        includeExpired: false,
        sortBy: "relevance",
        sortOrder: "desc",
        limit: 20,
        offset: 0,
      };
      const result = buildWhereClause(minimal);
      expect(result.whereClauses).toContain("d.is_active = 1");
      expect(result.whereClauses.some((c) => c.includes("expiry_date"))).toBe(
        true,
      );
    });
  });
});

describe("buildOrderByClause", () => {
  function buildQuery(
    overrides: Partial<StructuredQuery> = {},
  ): StructuredQuery {
    return createBaseQuery(overrides);
  }

  describe("sortBy confidence_score", () => {
    it("should order by confidence_score desc", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "confidence_score", sortOrder: "desc" }),
      );
      expect(result).toBe("ORDER BY d.confidence_score DESC, fts.rank");
    });

    it("should order by confidence_score asc", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "confidence_score", sortOrder: "asc" }),
      );
      expect(result).toBe("ORDER BY d.confidence_score ASC, fts.rank");
    });
  });

  describe("sortBy reward_value", () => {
    it("should order by reward_value desc", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "reward_value", sortOrder: "desc" }),
      );
      expect(result).toBe("ORDER BY d.reward_value DESC, fts.rank");
    });

    it("should order by reward_value asc", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "reward_value", sortOrder: "asc" }),
      );
      expect(result).toBe("ORDER BY d.reward_value ASC, fts.rank");
    });
  });

  describe("sortBy created_at", () => {
    it("should order by created_at desc", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "created_at", sortOrder: "desc" }),
      );
      expect(result).toBe("ORDER BY d.created_at DESC");
    });

    it("should order by created_at asc", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "created_at", sortOrder: "asc" }),
      );
      expect(result).toBe("ORDER BY d.created_at ASC");
    });

    it("should not include fts.rank for created_at sorting", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "created_at", sortOrder: "desc" }),
      );
      expect(result).not.toContain("fts.rank");
    });
  });

  describe("sortBy expiry_date", () => {
    it("should order by expiry_date desc", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "expiry_date", sortOrder: "desc" }),
      );
      expect(result).toBe("ORDER BY d.expiry_date DESC");
    });

    it("should order by expiry_date asc", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "expiry_date", sortOrder: "asc" }),
      );
      expect(result).toBe("ORDER BY d.expiry_date ASC");
    });

    it("should not include fts.rank for expiry_date sorting", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "expiry_date", sortOrder: "desc" }),
      );
      expect(result).not.toContain("fts.rank");
    });
  });

  describe("sortBy title", () => {
    it("should order by title desc", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "title", sortOrder: "desc" }),
      );
      expect(result).toBe("ORDER BY d.title DESC");
    });

    it("should order by title asc", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "title", sortOrder: "asc" }),
      );
      expect(result).toBe("ORDER BY d.title ASC");
    });

    it("should not include fts.rank for title sorting", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "title", sortOrder: "desc" }),
      );
      expect(result).not.toContain("fts.rank");
    });
  });

  describe("sortBy relevance (default)", () => {
    it("should order by fts.rank when sortBy is relevance", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "relevance", sortOrder: "desc" }),
      );
      expect(result).toBe("ORDER BY fts.rank");
    });

    it("should order by fts.rank regardless of sortOrder", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "relevance", sortOrder: "asc" }),
      );
      expect(result).toBe("ORDER BY fts.rank");
    });

    it("should default to relevance when sortBy is undefined", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: undefined as any }),
      );
      expect(result).toBe("ORDER BY fts.rank");
    });

    it("should default to relevance when sortBy is an unknown value", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "unknown_field" as any }),
      );
      expect(result).toBe("ORDER BY fts.rank");
    });
  });

  describe("sortOrder variations", () => {
    it("should uppercase desc order", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "created_at", sortOrder: "desc" }),
      );
      expect(result).toContain("DESC");
    });

    it("should uppercase asc order", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "created_at", sortOrder: "asc" }),
      );
      expect(result).toContain("ASC");
    });

    it("should sort by title ascending", () => {
      const result = buildOrderByClause(
        buildQuery({ sortBy: "title", sortOrder: "asc" }),
      );
      expect(result).toBe("ORDER BY d.title ASC");
    });
  });
});
