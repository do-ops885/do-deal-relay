import { describe, it, expect, vi, beforeEach } from "vitest";
import { createProgressMeta, withProgress } from "../../worker/lib/mcp/utils";

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
