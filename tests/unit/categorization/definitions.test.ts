import { describe, it, expect } from "vitest";
import {
  CATEGORY_DEFINITIONS,
  type CategoryDefinition,
} from "../../../worker/lib/categorization/definitions";

describe("Category Definitions", () => {
  describe("CATEGORY_DEFINITIONS structure", () => {
    it("should define all expected categories", () => {
      const expectedCategories = [
        "finance",
        "food_delivery",
        "transportation",
        "travel",
        "shopping",
        "cloud_storage",
        "communication",
        "entertainment",
        "health",
        "education",
        "software",
        "referral",
      ];

      expectedCategories.forEach((category) => {
        expect(CATEGORY_DEFINITIONS[category]).toBeDefined();
      });
    });

    it("should have correct number of categories", () => {
      expect(Object.keys(CATEGORY_DEFINITIONS).length).toBe(12);
    });

    it("should have valid structure for each category", () => {
      Object.entries(CATEGORY_DEFINITIONS).forEach(([name, def]) => {
        expect(Array.isArray(def.keywords)).toBe(true);
        expect(Array.isArray(def.domains)).toBe(true);
        expect(typeof def.description).toBe("string");
        expect(def.description.length).toBeGreaterThan(0);
      });
    });

    it("should have non-empty keywords for most categories", () => {
      Object.entries(CATEGORY_DEFINITIONS).forEach(([name, def]) => {
        expect(def.keywords.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Finance category", () => {
    const finance = CATEGORY_DEFINITIONS.finance;

    it("should include banking keywords", () => {
      expect(finance.keywords).toContain("bank");
      expect(finance.keywords).toContain("investing");
      expect(finance.keywords).toContain("trading");
    });

    it("should include crypto keywords", () => {
      expect(finance.keywords).toContain("crypto");
    });

    it("should include known financial domains", () => {
      expect(finance.domains).toContain("robinhood.com");
      expect(finance.domains).toContain("coinbase.com");
      expect(finance.domains).toContain("chase.com");
    });

    it("should have descriptive description", () => {
      expect(finance.description.toLowerCase()).toContain("financial");
    });
  });

  describe("Food delivery category", () => {
    const foodDelivery = CATEGORY_DEFINITIONS.food_delivery;

    it("should include food-related keywords", () => {
      expect(foodDelivery.keywords).toContain("food");
      expect(foodDelivery.keywords).toContain("delivery");
      expect(foodDelivery.keywords).toContain("restaurant");
    });

    it("should include known food delivery domains", () => {
      expect(foodDelivery.domains).toContain("doordash.com");
      expect(foodDelivery.domains).toContain("ubereats.com");
      expect(foodDelivery.domains).toContain("grubhub.com");
    });
  });

  describe("Travel category", () => {
    const travel = CATEGORY_DEFINITIONS.travel;

    it("should include travel keywords", () => {
      expect(travel.keywords).toContain("hotel");
      expect(travel.keywords).toContain("flight");
      expect(travel.keywords).toContain("booking");
    });

    it("should include known travel domains", () => {
      expect(travel.domains).toContain("airbnb.com");
      expect(travel.domains).toContain("booking.com");
      expect(travel.domains).toContain("expedia.com");
    });
  });

  describe("Shopping category", () => {
    const shopping = CATEGORY_DEFINITIONS.shopping;

    it("should include shopping keywords", () => {
      expect(shopping.keywords).toContain("shop");
      expect(shopping.keywords).toContain("discount");
      expect(shopping.keywords).toContain("coupon");
    });

    it("should include known shopping domains", () => {
      expect(shopping.domains).toContain("amazon.com");
      expect(shopping.domains).toContain("ebay.com");
      expect(shopping.domains).toContain("walmart.com");
    });
  });

  describe("Entertainment category", () => {
    const entertainment = CATEGORY_DEFINITIONS.entertainment;

    it("should include streaming keywords", () => {
      expect(entertainment.keywords).toContain("streaming");
      expect(entertainment.keywords).toContain("movie");
      expect(entertainment.keywords).toContain("music");
    });

    it("should include known entertainment domains", () => {
      expect(entertainment.domains).toContain("netflix.com");
      expect(entertainment.domains).toContain("spotify.com");
      expect(entertainment.domains).toContain("hulu.com");
    });
  });

  describe("Referral category", () => {
    const referral = CATEGORY_DEFINITIONS.referral;

    it("should include referral keywords", () => {
      expect(referral.keywords).toContain("refer");
      expect(referral.keywords).toContain("referral");
      expect(referral.keywords).toContain("invite");
    });

    it("should have empty domains array", () => {
      expect(referral.domains).toEqual([]);
    });

    it("should have generic description", () => {
      expect(referral.description.toLowerCase()).toContain("referral");
    });
  });

  describe("Cloud storage category", () => {
    const cloudStorage = CATEGORY_DEFINITIONS.cloud_storage;

    it("should include cloud keywords", () => {
      expect(cloudStorage.keywords).toContain("cloud");
      expect(cloudStorage.keywords).toContain("storage");
      expect(cloudStorage.keywords).toContain("backup");
    });

    it("should include known cloud domains", () => {
      expect(cloudStorage.domains).toContain("dropbox.com");
      expect(cloudStorage.domains).toContain("aws.amazon.com");
      expect(cloudStorage.domains).toContain("cloud.google.com");
    });
  });

  describe("Category matching rules", () => {
    it("should match finance deals by domain", () => {
      const dealDomain = "robinhood.com";
      const matches = CATEGORY_DEFINITIONS.finance.domains.some(
        (d) => dealDomain.includes(d) || d.includes(dealDomain),
      );
      expect(matches).toBe(true);
    });

    it("should match finance deals by keywords", () => {
      const dealText = "open a brokerage account and start trading stocks";
      const matches = CATEGORY_DEFINITIONS.finance.keywords.some((kw) =>
        dealText.includes(kw.toLowerCase()),
      );
      expect(matches).toBe(true);
    });

    it("should match food delivery deals by domain", () => {
      const dealDomain = "doordash.com";
      const matches = CATEGORY_DEFINITIONS.food_delivery.domains.some(
        (d) => dealDomain.includes(d) || d.includes(dealDomain),
      );
      expect(matches).toBe(true);
    });

    it("should match travel deals by keywords", () => {
      const dealText = "book a hotel room for your vacation trip";
      const matches = CATEGORY_DEFINITIONS.travel.keywords.some((kw) =>
        dealText.includes(kw.toLowerCase()),
      );
      expect(matches).toBe(true);
    });

    it("should not match unrelated categories", () => {
      const dealText = "get free cloud storage backup";
      const financeMatches = CATEGORY_DEFINITIONS.finance.keywords.some((kw) =>
        dealText.includes(kw.toLowerCase()),
      );
      expect(financeMatches).toBe(false);
    });
  });

  describe("Default category assignment", () => {
    it("should have referral as catch-all category", () => {
      expect(CATEGORY_DEFINITIONS.referral).toBeDefined();
      expect(CATEGORY_DEFINITIONS.referral.domains).toHaveLength(0);
    });

    it("should have general fallback via keywords", () => {
      // Referral category should match common referral patterns
      const referralText = "sign up and get a bonus for inviting a friend";
      const matches = CATEGORY_DEFINITIONS.referral.keywords.some((kw) =>
        referralText.includes(kw.toLowerCase()),
      );
      expect(matches).toBe(true);
    });
  });

  describe("Category uniqueness", () => {
    it("should have unique category names", () => {
      const names = Object.keys(CATEGORY_DEFINITIONS);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });

    it("should have unique descriptions", () => {
      const descriptions = Object.values(CATEGORY_DEFINITIONS).map(
        (c) => c.description,
      );
      const uniqueDescriptions = new Set(descriptions);
      expect(descriptions.length).toBe(uniqueDescriptions.size);
    });
  });

  describe("Category keyword coverage", () => {
    it("should have at least 5 keywords per category", () => {
      Object.entries(CATEGORY_DEFINITIONS).forEach(([name, def]) => {
        expect(def.keywords.length).toBeGreaterThanOrEqual(5);
      });
    });

    it("should have at least 5 domains for major categories", () => {
      const majorCategories = [
        "finance",
        "food_delivery",
        "shopping",
        "entertainment",
      ];
      majorCategories.forEach((cat) => {
        expect(CATEGORY_DEFINITIONS[cat].domains.length).toBeGreaterThanOrEqual(
          5,
        );
      });
    });
  });
});
