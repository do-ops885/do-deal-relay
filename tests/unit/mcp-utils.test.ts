import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  encodeCursor,
  decodeCursor,
  paginate,
  createProgressMeta,
  withProgress,
} from "../../worker/lib/mcp/utils";

describe("MCP Utils - Pagination", () => {
  describe("encodeCursor / decodeCursor", () => {
    it("should encode offset and limit into a base64 cursor", () => {
      const cursor = encodeCursor(10, 5);
      expect(typeof cursor).toBe("string");
      expect(cursor.length).toBeGreaterThan(0);
    });

    it("should decode cursor back to offset and limit", () => {
      const cursor = encodeCursor(20, 10);
      const decoded = decodeCursor(cursor);

      expect(decoded).not.toBeNull();
      expect(decoded!.offset).toBe(20);
      expect(decoded!.limit).toBe(10);
    });

    it("should return null for invalid cursor", () => {
      expect(decodeCursor("not-valid-base64-json")).toBeNull();
      expect(decodeCursor("")).toBeNull();
      expect(decodeCursor("invalid")).toBeNull();
    });

    it("should return null for cursor with missing fields", () => {
      const badCursor = btoa(JSON.stringify({ offset: 10 }));
      expect(decodeCursor(badCursor)).toBeNull();
    });

    it("should handle zero offset", () => {
      const cursor = encodeCursor(0, 10);
      const decoded = decodeCursor(cursor);

      expect(decoded).not.toBeNull();
      expect(decoded!.offset).toBe(0);
      expect(decoded!.limit).toBe(10);
    });
  });

  describe("paginate", () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ id: i }));

    it("should return first page without cursor", () => {
      const result = paginate(items, undefined, 10);

      expect(result.items).toHaveLength(10);
      expect(result.items[0].id).toBe(0);
      expect(result.items[9].id).toBe(9);
      expect(result.total).toBe(25);
      expect(result.nextCursor).toBeDefined();
    });

    it("should return second page with cursor", () => {
      const firstPage = paginate(items, undefined, 10);
      const secondPage = paginate(items, firstPage.nextCursor, 10);

      expect(secondPage.items).toHaveLength(10);
      expect(secondPage.items[0].id).toBe(10);
      expect(secondPage.items[9].id).toBe(19);
      expect(secondPage.total).toBe(25);
      expect(secondPage.nextCursor).toBeDefined();
    });

    it("should return last page with no nextCursor", () => {
      const firstPage = paginate(items, undefined, 10);
      const secondPage = paginate(items, firstPage.nextCursor, 10);
      const lastPage = paginate(items, secondPage.nextCursor, 10);

      expect(lastPage.items).toHaveLength(5);
      expect(lastPage.items[0].id).toBe(20);
      expect(lastPage.items[4].id).toBe(24);
      expect(lastPage.nextCursor).toBeUndefined();
    });

    it("should handle empty array", () => {
      const result = paginate([], undefined, 10);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.nextCursor).toBeUndefined();
    });

    it("should handle fewer items than page size", () => {
      const smallArray = [{ id: 1 }, { id: 2 }];
      const result = paginate(smallArray, undefined, 10);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.nextCursor).toBeUndefined();
    });

    it("should use defaultLimit when no cursor provided", () => {
      const result = paginate(items, undefined, 5);

      expect(result.items).toHaveLength(5);
      expect(result.nextCursor).toBeDefined();
    });

    it("should preserve limit from cursor", () => {
      const firstPage = paginate(items, undefined, 3);
      const secondPage = paginate(items, firstPage.nextCursor, 10);

      expect(secondPage.items).toHaveLength(3);
    });

    it("should handle invalid cursor gracefully", () => {
      const result = paginate(items, "invalid-cursor", 10);

      expect(result.items).toHaveLength(10);
      expect(result.items[0].id).toBe(0);
    });
  });
});

describe("MCP Utils - Progress Notifications", () => {
  describe("createProgressMeta", () => {
    it("should create progress metadata with all fields", () => {
      const meta = createProgressMeta("token-1", 5, 10, "Processing");

      expect(meta._meta.progress.progressToken).toBe("token-1");
      expect(meta._meta.progress.progress).toBe(5);
      expect(meta._meta.progress.total).toBe(10);
      expect(meta._meta.progress.message).toBe("Processing");
    });

    it("should create progress metadata without optional fields", () => {
      const meta = createProgressMeta(42, 3);

      expect(meta._meta.progress.progressToken).toBe(42);
      expect(meta._meta.progress.progress).toBe(3);
      expect(meta._meta.progress.total).toBeUndefined();
      expect(meta._meta.progress.message).toBeUndefined();
    });

    it("should handle numeric progressToken", () => {
      const meta = createProgressMeta(123, 1, 1);

      expect(meta._meta.progress.progressToken).toBe(123);
    });

    it("should handle string progressToken", () => {
      const meta = createProgressMeta("abc-123", 1, 1);

      expect(meta._meta.progress.progressToken).toBe("abc-123");
    });
  });

  describe("withProgress", () => {
    it("should execute operation without progress when no token provided", async () => {
      const result = await withProgress(undefined, 3, async () => ({
        value: 42,
      }));

      expect(result.value).toBe(42);
      expect(result._meta).toBeUndefined();
    });

    it("should include progress metadata when token provided", async () => {
      const result = await withProgress(
        "test-token",
        5,
        async (step, reportProgress) => {
          reportProgress(3, "Almost done");
          return { value: 100 };
        },
      );

      expect(result.value).toBe(100);
      expect(result._meta).toBeDefined();
      expect(result._meta!.progress!.progressToken).toBe("test-token");
      expect(result._meta!.progress!.progress).toBe(3);
      expect(result._meta!.progress!.total).toBe(5);
    });

    it("should handle operation that does not report progress", async () => {
      const result = await withProgress("token", 2, async () => ({
        data: "test",
      }));

      expect(result.data).toBe("test");
      expect(result._meta!.progress!.progress).toBe(0);
      expect(result._meta!.progress!.total).toBe(2);
    });

    it("should handle async operations", async () => {
      const result = await withProgress(
        "async-token",
        3,
        async (step, reportProgress) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          reportProgress(2);
          return { completed: true };
        },
      );

      expect(result.completed).toBe(true);
      expect(result._meta!.progress!.progress).toBe(2);
    });

    it("should propagate errors from operation", async () => {
      await expect(
        withProgress("error-token", 1, async () => {
          throw new Error("Operation failed");
        }),
      ).rejects.toThrow("Operation failed");
    });
  });
});
