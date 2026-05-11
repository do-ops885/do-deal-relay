import { describe, it, expect } from "vitest";
import { checkIdempotency } from "../../../worker/validation/gates/idempotency-check";
import { Deal } from "../../../worker/types";

describe("idempotency-check gate", () => {
  const deal: Deal = {
    id: "existing-id",
  } as any;

  it("should pass if deal ID is not in existing IDs", () => {
    const existingIds = new Set(["other-id"]);
    const result = checkIdempotency(deal, existingIds);
    expect(result.passed).toBe(true);
  });

  it("should fail if deal ID is in existing IDs", () => {
    const existingIds = new Set(["existing-id"]);
    const result = checkIdempotency(deal, existingIds);
    expect(result.passed).toBe(false);
    expect(result.reason).toBe("Deal already exists in production snapshot");
  });
});
