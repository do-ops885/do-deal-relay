/**
 * Missing-wiring sweep: NLQ multi-intent wiring.
 *
 * `isComparisonQuery` is now the single source of truth for comparison
 * detection in classifyIntent/classifyAllIntents, and `getSecondaryIntents`
 * is surfaced through the NLQ explain and query responses.
 */

import { describe, it, expect } from "vitest";
import {
  classifyIntent,
  getSecondaryIntents,
  isComparisonQuery,
} from "../../../worker/lib/nlq/intent";

describe("isComparisonQuery adoption", () => {
  it("classifies comparison phrasings as compare intent", () => {
    for (const query of [
      "compare trading 212 and etoro",
      "trading 212 vs etoro",
      "what is the difference between A and B",
      "is X better than Y",
    ]) {
      expect(isComparisonQuery(query)).toBe(true);
      expect(classifyIntent(query).intent).toBe("compare");
    }
  });

  it("does not classify plain searches as comparisons", () => {
    const result = classifyIntent("find trading bonuses with cash rewards");
    expect(result.intent).not.toBe("compare");
    expect(isComparisonQuery("find trading bonuses")).toBe(false);
  });
});

describe("getSecondaryIntents", () => {
  it("returns non-primary intents above the confidence floor", () => {
    const secondary = getSecondaryIntents(
      "compare and rank the top trading bonuses",
      "compare",
    );
    expect(secondary.length).toBeGreaterThan(0);
    expect(secondary.length).toBeLessThanOrEqual(2);
    for (const entry of secondary) {
      expect(entry.intent).not.toBe("compare");
      expect(entry.confidence).toBeGreaterThan(0.3);
    }
  });

  it("returns an empty list when only one intent scores", () => {
    const secondary = getSecondaryIntents("hello there", "search");
    expect(secondary).toEqual([]);
  });
});
