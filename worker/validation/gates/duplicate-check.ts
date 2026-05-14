import { Deal, PipelineContext } from "../../pipeline/types";
import { GateResult } from "../types";

/**
 * Gate 3: Deduplication Check
 */
export function checkDeduplication(
  deal: Deal,
  ctx: PipelineContext,
): GateResult {
  // Check for duplicate in current batch
  const duplicates = ctx.validated.filter(
    (d) =>
      d.id === deal.id ||
      (d.source.domain === deal.source.domain && d.code === deal.code),
  );

  if (duplicates.length > 0) {
    return {
      passed: false,
      reason: `Duplicate detected: ${duplicates[0]?.id}`,
    };
  }

  return { passed: true };
}
