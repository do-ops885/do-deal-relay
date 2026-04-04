import { describe, it, expect, vi, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  submitExperienceEvent,
  getExperienceAggregate,
  runAggregation,
} from "../../worker/lib/d1/experience";

const createMockStatement = () => ({
  bind: vi.fn().mockReturnThis(),
  all: vi.fn().mockResolvedValue({ results: [], meta: {} }),
  first: vi.fn().mockResolvedValue(null),
  run: vi.fn().mockResolvedValue({ results: [], meta: {} }),
});

let currentMockStatement = createMockStatement();
let currentMockSession: ReturnType<typeof createMockSession> | null = null;

const createMockSession = () => ({
  prepare: vi.fn().mockImplementation(() => currentMockStatement),
  getBookmark: vi.fn().mockReturnValue("test-bookmark"),
});

const createMockD1 = () => {
  currentMockStatement = createMockStatement();
  currentMockSession = createMockSession();
  return {
    prepare: vi.fn().mockImplementation(() => currentMockStatement),
    batch: vi.fn().mockResolvedValue([]),
    exec: vi.fn().mockResolvedValue(undefined),
    withSession: vi.fn().mockImplementation(() => currentMockSession),
  };
};

describe("Experience D1 Queries", () => {
  let mockDb: ReturnType<typeof createMockD1>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockD1();
  });

  describe("submitExperienceEvent", () => {
    it("should insert an experience event successfully", async () => {
      currentMockStatement.run.mockResolvedValue({
        success: true,
        meta: { last_row_id: 1, changes: 1 },
      });

      const result = await submitExperienceEvent(
        mockDb as unknown as D1Database,
        {
          id: "evt-001",
          deal_code: "DEAL123",
          event_type: "click",
          agent_id: "agent-1",
          score: 50,
          metadata: '{"source": "test"}',
        },
      );

      expect(result.success).toBe(true);
      expect(result.event?.id).toBe("evt-001");
      expect(result.event?.deal_code).toBe("DEAL123");
    });

    it("should handle event without optional fields", async () => {
      currentMockStatement.run.mockResolvedValue({
        success: true,
        meta: { last_row_id: 2, changes: 1 },
      });

      const result = await submitExperienceEvent(
        mockDb as unknown as D1Database,
        {
          id: "evt-002",
          deal_code: "DEAL456",
          event_type: "view",
        },
      );

      expect(result.success).toBe(true);
      expect(result.event?.score).toBeNull();
      expect(result.event?.agent_id).toBeNull();
    });

    it("should return error on insert failure", async () => {
      currentMockStatement.run.mockRejectedValue(
        new Error("Constraint violation"),
      );

      const result = await submitExperienceEvent(
        mockDb as unknown as D1Database,
        {
          id: "evt-003",
          deal_code: "DEAL789",
          event_type: "feedback",
          score: -10,
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("getExperienceAggregate", () => {
    it("should return aggregate data for a deal", async () => {
      const mockAggregate = {
        deal_code: "DEAL123",
        total_events: 10,
        positive_events: 7,
        negative_events: 2,
        avg_score: 45.5,
        last_updated: 1700000000,
      };

      currentMockStatement.first.mockResolvedValue(mockAggregate);

      const result = await getExperienceAggregate(
        mockDb as unknown as D1Database,
        "DEAL123",
      );

      expect(result.success).toBe(true);
      expect(result.aggregate?.deal_code).toBe("DEAL123");
      expect(result.aggregate?.total_events).toBe(10);
    });

    it("should return undefined when no aggregate found", async () => {
      currentMockStatement.first.mockResolvedValue(null);

      const result = await getExperienceAggregate(
        mockDb as unknown as D1Database,
        "NONEXISTENT",
      );

      expect(result.success).toBe(true);
      expect(result.aggregate).toBeUndefined();
    });

    it("should return error on query failure", async () => {
      currentMockStatement.first.mockRejectedValue(new Error("DB error"));

      const result = await getExperienceAggregate(
        mockDb as unknown as D1Database,
        "DEAL123",
      );

      expect(result.success).toBe(false);
    });
  });

  describe("runAggregation", () => {
    it("should process deals and update aggregates", async () => {
      currentMockStatement.run
        .mockResolvedValueOnce({
          results: [{ deal_code: "DEAL1" }, { deal_code: "DEAL2" }],
          success: true,
          meta: { rows_read: 2, rows_written: 0 },
        })
        .mockResolvedValueOnce({
          results: [],
          success: true,
          meta: { rows_read: 0, rows_written: 0 },
        })
        .mockResolvedValueOnce({
          results: [],
          success: true,
          meta: { rows_read: 0, rows_written: 0 },
        });

      currentMockStatement.first
        .mockResolvedValueOnce({
          total: 5,
          positive: 3,
          negative: 1,
          avg: 40,
        })
        .mockResolvedValueOnce({
          total: 3,
          positive: 2,
          negative: 0,
          avg: 25,
        });

      const result = await runAggregation(mockDb as unknown as D1Database);

      expect(result.success).toBe(true);
      expect(result.dealsProcessed).toBe(2);
      expect(result.eventsProcessed).toBe(8);
    });

    it("should handle no events to aggregate", async () => {
      currentMockStatement.run.mockResolvedValue({
        results: [],
        success: true,
        meta: { rows_read: 0, rows_written: 0 },
      });

      const result = await runAggregation(mockDb as unknown as D1Database);

      expect(result.success).toBe(true);
      expect(result.dealsProcessed).toBe(0);
      expect(result.eventsProcessed).toBe(0);
    });
  });
});
