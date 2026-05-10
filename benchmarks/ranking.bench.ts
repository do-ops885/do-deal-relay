import { bench, describe } from "vitest";
import { rankDeals } from "../worker/lib/ranking";
import { generateTestDeals } from "./bench-utils";

describe("rankDeals", () => {
  const deals100 = generateTestDeals(100);
  const deals1000 = generateTestDeals(1000);

  bench("rank 100 deals", () => {
    rankDeals(deals100, {
      sortBy: "confidence",
      order: "desc",
    });
  });

  bench("rank 1000 deals", () => {
    rankDeals(deals1000, {
      sortBy: "confidence",
      order: "desc",
    });
  });
});
