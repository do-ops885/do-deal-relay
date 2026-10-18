import { describe, it, expect } from "vitest";
import { renderDealsView } from "../../public/js/deals.js";
import { renderReferralsView } from "../../public/js/referrals.js";
import { renderAnalyticsView } from "../../public/js/analytics.js";
import {
  showDealDetail,
  closeDealDetail,
} from "../../public/js/components/deal-detail.js";

describe("public SPA view wiring contract", () => {
  it("exposes the renderers registered by app.js", () => {
    expect(typeof renderDealsView).toBe("function");
    expect(typeof renderReferralsView).toBe("function");
    expect(typeof renderAnalyticsView).toBe("function");
    expect(typeof showDealDetail).toBe("function");
    expect(typeof closeDealDetail).toBe("function");
  });
});
