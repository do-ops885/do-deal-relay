import { describe, it, expect } from "vitest";
import { buildOrderByClause } from "../../../../worker/lib/nlq/query-builder/sql";
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
