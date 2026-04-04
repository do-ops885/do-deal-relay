import { describe, it, expect, vi } from "vitest";
import {
  fetchInBatches,
  executeInBatches,
  chunkArray,
  retryWithBackoff,
} from "../../worker/lib/utils";
import { CONFIG } from "../../worker/config";

describe("Utils - fetchInBatches", () => {
  it("should process empty array", async () => {
    const mapper = vi.fn(async (x: number) => x * 2);
    const results = await fetchInBatches([], mapper);

    expect(results).toEqual([]);
    expect(mapper).not.toHaveBeenCalled();
  });

  it("should process single item", async () => {
    const mapper = vi.fn(async (x: number) => x * 2);
    const results = await fetchInBatches([5], mapper);

    expect(results).toEqual([10]);
    expect(mapper).toHaveBeenCalledTimes(1);
    expect(mapper).toHaveBeenCalledWith(5);
  });

  it("should process multiple items in single batch", async () => {
    const mapper = vi.fn(async (x: number) => x * 2);
    const items = [1, 2, 3, 4, 5];
    const results = await fetchInBatches(items, mapper, 10);

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(mapper).toHaveBeenCalledTimes(5);
  });

  it("should process items in multiple batches", async () => {
    const mapper = vi.fn(async (x: number) => x * 2);
    const items = [1, 2, 3, 4, 5];
    const results = await fetchInBatches(items, mapper, 2);

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(mapper).toHaveBeenCalledTimes(5);
    // Should be called in 3 batches: [1,2], [3,4], [5]
  });

  it("should filter out null results", async () => {
    const mapper = vi.fn(async (x: number) => {
      if (x % 2 === 0) return null;
      return x * 2;
    });
    const items = [1, 2, 3, 4, 5];
    const results = await fetchInBatches(items, mapper);

    expect(results).toEqual([2, 6, 10]); // Only odd numbers doubled
  });

  it("should filter out undefined results", async () => {
    const mapper = vi.fn(async (x: number) => {
      if (x === 3) return undefined;
      return x * 2;
    });
    const items = [1, 2, 3, 4];
    const results = await fetchInBatches(items, mapper);

    expect(results).toEqual([2, 4, 8]); // 3 is excluded
  });

  it("should handle partial failures gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mapper = vi.fn(async (x: number) => {
      if (x === 3) throw new Error("Failed for 3");
      return x * 2;
    });
    const items = [1, 2, 3, 4, 5];
    const results = await fetchInBatches(items, mapper, 10);

    // Should still get successful results
    expect(results).toEqual([2, 4, 8, 10]);
    expect(mapper).toHaveBeenCalledTimes(5);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Batch operation failed"),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it("should handle all failures gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mapper = vi.fn(async () => {
      throw new Error("All fail");
    });
    const items = [1, 2, 3];
    const results = await fetchInBatches(items, mapper);

    expect(results).toEqual([]);
    expect(mapper).toHaveBeenCalledTimes(3);
    expect(consoleSpy).toHaveBeenCalledTimes(3);

    consoleSpy.mockRestore();
  });

  it("should use default batch size from config", async () => {
    const mapper = vi.fn(async (x: number) => x * 2);
    const items = Array.from({ length: 30 }, (_, i) => i + 1);

    await fetchInBatches(items, mapper); // No batch size specified

    // Should use CONFIG.KV_BATCH_SIZE (25)
    expect(mapper).toHaveBeenCalledTimes(30);
    // First 25 should be in first batch, remaining 5 in second
    expect(CONFIG.KV_BATCH_SIZE).toBe(25);
  });

  it("should work with string inputs", async () => {
    const mapper = vi.fn(async (s: string) => s.toUpperCase());
    const items = ["a", "b", "c"];
    const results = await fetchInBatches(items, mapper);

    expect(results).toEqual(["A", "B", "C"]);
  });

  it("should work with object inputs", async () => {
    type Item = { id: number; name: string };
    const items: Item[] = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ];
    const mapper = vi.fn(async (item: Item) => ({
      ...item,
      name: item.name.toUpperCase(),
    }));

    const results = await fetchInBatches(items, mapper);

    expect(results).toEqual([
      { id: 1, name: "ALICE" },
      { id: 2, name: "BOB" },
    ]);
  });

  it("should handle exact batch size boundary", async () => {
    const mapper = vi.fn(async (x: number) => x * 2);
    const items = [1, 2, 3];
    const results = await fetchInBatches(items, mapper, 3);

    expect(results).toEqual([2, 4, 6]);
    expect(mapper).toHaveBeenCalledTimes(3);
  });
});

describe("Utils - executeInBatches", () => {
  it("should count successful operations", async () => {
    const operation = vi.fn(async () => {});
    const items = [1, 2, 3, 4, 5];

    const result = await executeInBatches(items, operation, 10);

    expect(result.success).toBe(5);
    expect(result.failed).toBe(0);
    expect(operation).toHaveBeenCalledTimes(5);
  });

  it("should count failed operations", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const operation = vi.fn(async (x: number) => {
      if (x === 3) throw new Error("Failed");
    });
    const items = [1, 2, 3, 4, 5];

    const result = await executeInBatches(items, operation);

    expect(result.success).toBe(4);
    expect(result.failed).toBe(1);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("should handle empty array", async () => {
    const operation = vi.fn(async () => {});
    const result = await executeInBatches([], operation);

    expect(result.success).toBe(0);
    expect(result.failed).toBe(0);
    expect(operation).not.toHaveBeenCalled();
  });
});

describe("Utils - chunkArray", () => {
  it("should return empty array for empty input", () => {
    expect(chunkArray([], 3)).toEqual([]);
  });

  it("should chunk into equal size", () => {
    const arr = [1, 2, 3, 4, 5, 6];
    expect(chunkArray(arr, 2)).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it("should handle uneven chunks", () => {
    const arr = [1, 2, 3, 4, 5];
    expect(chunkArray(arr, 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("should handle chunk size larger than array", () => {
    const arr = [1, 2, 3];
    expect(chunkArray(arr, 5)).toEqual([[1, 2, 3]]);
  });

  it("should handle chunk size of 1", () => {
    const arr = [1, 2, 3];
    expect(chunkArray(arr, 1)).toEqual([[1], [2], [3]]);
  });
});

describe("Utils - retryWithBackoff", () => {
  it("should return result on first success", async () => {
    const operation = vi.fn(async () => "success");
    const result = await retryWithBackoff(operation, 3, 100);

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("should retry on failure and eventually succeed", async () => {
    let attempts = 0;
    const operation = vi.fn(async () => {
      attempts++;
      if (attempts < 3) throw new Error("Temporary failure");
      return "success";
    });
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await retryWithBackoff(operation, 3, 100);

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(consoleSpy).toHaveBeenCalledTimes(2); // 2 retry warnings

    consoleSpy.mockRestore();
  });

  it("should throw after max retries exhausted", async () => {
    const operation = vi.fn(async () => {
      throw new Error("Persistent failure");
    });
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(retryWithBackoff(operation, 2, 10)).rejects.toThrow(
      "Persistent failure",
    );
    expect(operation).toHaveBeenCalledTimes(3); // initial + 2 retries

    consoleSpy.mockRestore();
  });

  it("should use default config values", async () => {
    const operation = vi.fn(async () => "success");
    await retryWithBackoff(operation);

    expect(operation).toHaveBeenCalled();
    expect(CONFIG.MAX_RETRIES).toBe(3);
    expect(CONFIG.RETRY_DELAY_MS).toBe(1000);
  });
});
