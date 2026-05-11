import { describe, it, expect, vi } from "vitest";
import { verifySnapshotHash } from "../../../worker/validation/gates/snapshot-hash-verification";
import { Deal, PipelineContext } from "../../../worker/types";

// Mock crypto module
vi.mock("../../../worker/lib/crypto", () => ({
  generateSnapshotHash: vi.fn(async (items) => {
    // Return a stable mock hash based on the input
    return `hash-${JSON.stringify(items[0].id || items[0])}`;
  }),
}));

describe("snapshot-hash-verification gate", () => {
  const deal: Deal = {
    id: "test-id",
    source: { domain: "example.com" },
    code: "CODE",
    reward: { type: "cash", value: 10 },
  } as any;

  it("should pass if no expected hash in context", async () => {
    const ctx: PipelineContext = {
      snapshot: undefined,
    } as any;
    const result = await verifySnapshotHash(deal, ctx);
    expect(result.passed).toBe(true);
    expect(result.reason).toBe("No expected hash configured for verification");
  });

  it("should pass if hashes match", async () => {
    // Both will generate "hash-test-id" (simplified mock)
    const ctx: PipelineContext = {
      snapshot: { snapshot_hash: "hash-test-id" },
    } as any;
    const result = await verifySnapshotHash(deal, ctx);
    expect(result.passed).toBe(true);
  });

  it("should fail if data tampered with (hash mismatch)", async () => {
    // Snapshot hash doesn't match current deal hash
    const ctx: PipelineContext = {
      snapshot: { snapshot_hash: "mismatch" },
      // Store a different hash for this deal in context
      "deal_hash_test-id": "stored-hash"
    } as any;

    const result = await verifySnapshotHash(deal, ctx);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Hash verification failed");
  });
});
