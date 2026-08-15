import type { Deal } from "../types";

// ============================================================================
// Deal Status Statistics
// ============================================================================

export interface DealStatusCounts {
  active: number;
  quarantined: number;
  rejected: number;
}

/**
 * Counts deals by metadata status in a single O(N) pass.
 *
 * Returns tallies for active, quarantined, and rejected deals. This replaces
 * the previous multiple `.filter()` traversals, which scanned the deals array
 * once per status.
 *
 * @param deals - The deals to tally.
 * @returns Per-status counts.
 */
export function countDealStatuses(deals: Deal[]): DealStatusCounts {
  const counts: DealStatusCounts = { active: 0, quarantined: 0, rejected: 0 };
  for (const deal of deals) {
    const status = deal.metadata.status;
    if (status === "active") {
      counts.active++;
    } else if (status === "quarantined") {
      counts.quarantined++;
    } else if (status === "rejected") {
      counts.rejected++;
    }
  }
  return counts;
}
