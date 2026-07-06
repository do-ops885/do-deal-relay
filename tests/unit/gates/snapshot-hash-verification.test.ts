import { describe, it, expect, vi } from "vitest";
import { verifySnapshotHash } from "../../../worker/validation/gates/snapshot-hash-verification";
import { Deal, PipelineContext } from "../../../worker/types";

vi.mock("../../../worker/lib/crypto", () => ({
  generateSnapshotHash: vi.fn(async (items) => {
    return `hash-${JSON.stringify(items[0])}`;
  }),
}));

describe("snapshot-hash-verification gate", () => {
  const deal: Deal = {
    id: "test-id",
    source: { domain: "example.com" },
    code: "CODE",
    reward: { type: "cash", value: 10 },
  } as any;

  it("should fail if critical fields are missing", async () => {
    const ctx = {} as PipelineContext;
    const result = await verifySnapshotHash(
      { ...deal, id: "" } as Deal,
      ctx,
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("missing critical fields");
  });

  it("should pass and store hash when no prior hash exists", async () => {
    const ctx = {} as PipelineContext;
    const result = await verifySnapshotHash(deal, ctx);
    expect(result.passed).toBe(true);
    const { getContextHash } = await import("../../../worker/validation/types");
    expect(getContextHash(ctx, "test-id")).toBeDefined();
  });

  it("should pass if stored hash matches computed hash", async () => {
    const { generateSnapshotHash } = await import(
      "../../../worker/lib/crypto"
    );
    const currentHash = await generateSnapshotHash([
      {
        id: deal.id,
        domain: deal.source.domain,
        code: deal.code,
        rewardType: deal.reward.type,
        rewardValue: deal.reward.value,
      },
    ]);
    const ctx = {} as PipelineContext;
    const { setContextHash } = await import(
      "../../../worker/validation/types"
    );
    setContextHash(ctx, deal.id, currentHash);

    const result = await verifySnapshotHash(deal, ctx);
    expect(result.passed).toBe(true);
  });

  it("should fail if stored hash does not match (tampered)", async () => {
    const ctx = {} as PipelineContext;
    const { setContextHash } = await import(
      "../../../worker/validation/types"
    );
    setContextHash(ctx, deal.id, "different-hash");

    const result = await verifySnapshotHash(deal, ctx);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("mutated since creation");
  });
});
