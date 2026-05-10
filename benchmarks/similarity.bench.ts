import { bench, describe } from "vitest";
import {
  calculateStringSimilarity,
  calculateUrlSimilarity,
} from "../worker/lib/crypto";

describe("similarity scoring", () => {
  const strA = "The quick brown fox jumps over the lazy dog";
  const strB = "The quick brown fox jumps over the lazy dog!";
  const strC = "Pack my box with five dozen liquor jugs";

  const urlA = "https://example.com/path/to/deal?id=123&ref=abc";
  const urlB = "https://example.com/path/to/deal?id=456&ref=def";

  bench("string similarity (similar)", () => {
    calculateStringSimilarity(strA, strB);
  });

  bench("string similarity (different)", () => {
    calculateStringSimilarity(strA, strC);
  });

  bench("url similarity", () => {
    calculateUrlSimilarity(urlA, urlB);
  });
});
