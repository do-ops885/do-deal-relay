import { describe, it, expect, vi } from "vitest";
import { createTimeoutSignal, fetchInBatches } from "../../worker/lib/utils";

describe("Utils Extra", () => {
  describe("createTimeoutSignal", () => {
    it("should return an AbortSignal and a cleanup function", () => {
      const { signal, cleanup } = createTimeoutSignal(100);
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(typeof cleanup).toBe("function");
      cleanup();
    });

    it("should abort the signal after the specified timeout", async () => {
      vi.useFakeTimers();
      const { signal, cleanup } = createTimeoutSignal(100);
      expect(signal.aborted).toBe(false);
      vi.advanceTimersByTime(150);
      expect(signal.aborted).toBe(true);
      cleanup();
      vi.useRealTimers();
    });
  });

  describe("fetchInBatches", () => {
    it("should return results for all successful operations", async () => {
      const items = [1, 2, 3];
      const mapper = async (n: number) => n * 2;
      const results = await fetchInBatches(items, mapper, 2);
      expect(results).toEqual([2, 4, 6]);
    });
  });
});
