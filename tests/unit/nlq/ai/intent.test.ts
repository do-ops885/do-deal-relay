import { describe, it, expect } from "vitest";
import { validateIntent } from "../../../../worker/lib/nlq/ai/intent";

describe("AI Intent Classifier Utils", () => {
  describe("validateIntent", () => {
    it("should return valid intents as is", () => {
      expect(validateIntent("search")).toBe("search");
      expect(validateIntent("compare")).toBe("compare");
      expect(validateIntent("filter")).toBe("filter");
      expect(validateIntent("rank")).toBe("rank");
      expect(validateIntent("discover")).toBe("discover");
    });

    it("should return 'search' for invalid intents", () => {
      expect(validateIntent("invalid")).toBe("search");
      expect(validateIntent("count")).toBe("search");
      expect(validateIntent("")).toBe("search");
    });
  });
});
