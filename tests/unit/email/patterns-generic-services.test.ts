import { describe, it, expect } from "vitest";
import { GENERIC_PATTERNS } from "../../../worker/email/patterns";
import {
  SERVICE_PATTERNS,
  DOMAIN_TO_SERVICE,
} from "../../../worker/email/patterns";

// ============================================================================
// GENERIC_PATTERNS
// ============================================================================

describe("GENERIC_PATTERNS - subjectKeywords", () => {
  it("should match 'referral' keyword", () => {
    const regex = new RegExp(GENERIC_PATTERNS.subjectKeywords.source, "gi");
    expect(regex.test("Your referral code")).toBe(true);
  });

  it("should match 'invite' keyword", () => {
    const regex = new RegExp(GENERIC_PATTERNS.subjectKeywords.source, "gi");
    expect(regex.test("You received an invite")).toBe(true);
  });

  it("should match 'bonus' keyword", () => {
    const regex = new RegExp(GENERIC_PATTERNS.subjectKeywords.source, "gi");
    expect(regex.test("Get your bonus")).toBe(true);
  });

  it("should match 'credit' keyword", () => {
    const regex = new RegExp(GENERIC_PATTERNS.subjectKeywords.source, "gi");
    expect(regex.test("$20 credit for you")).toBe(true);
  });

  it("should match 'discount' keyword", () => {
    const regex = new RegExp(GENERIC_PATTERNS.subjectKeywords.source, "gi");
    expect(regex.test("Exclusive discount")).toBe(true);
  });

  it("should match 'promo' keyword", () => {
    const regex = new RegExp(GENERIC_PATTERNS.subjectKeywords.source, "gi");
    expect(regex.test("Promo code inside")).toBe(true);
  });

  it("should match German 'einladung' keyword", () => {
    const regex = new RegExp(GENERIC_PATTERNS.subjectKeywords.source, "gi");
    expect(regex.test("Deine Einladung")).toBe(true);
  });

  it("should match German 'freunde' keyword", () => {
    const regex = new RegExp(GENERIC_PATTERNS.subjectKeywords.source, "gi");
    expect(regex.test("Freunde werben")).toBe(true);
  });

  it("should not match unrelated text", () => {
    const regex = new RegExp(GENERIC_PATTERNS.subjectKeywords.source, "gi");
    expect(regex.test("Meeting tomorrow at 3pm")).toBe(false);
  });
});

describe("GENERIC_PATTERNS - referralUrlPatterns", () => {
  it("should match /refer/ path", () => {
    expect(
      GENERIC_PATTERNS.referralUrlPatterns[0].test(
        "https://example.com/refer/abc123",
      ),
    ).toBe(true);
  });

  it("should match /invite/ path", () => {
    expect(
      GENERIC_PATTERNS.referralUrlPatterns[0].test(
        "https://example.com/invite/xyz",
      ),
    ).toBe(true);
  });

  it("should match /share/ path", () => {
    expect(
      GENERIC_PATTERNS.referralUrlPatterns[0].test(
        "https://example.com/share/code",
      ),
    ).toBe(true);
  });

  it("should match /r/ path", () => {
    expect(
      GENERIC_PATTERNS.referralUrlPatterns[0].test("https://example.com/r/abc"),
    ).toBe(true);
  });

  it("should match query parameter ref=", () => {
    expect(
      GENERIC_PATTERNS.referralUrlPatterns[3].test(
        "https://example.com?ref=CODE123",
      ),
    ).toBe(true);
  });

  it("should match query parameter referral=", () => {
    expect(
      GENERIC_PATTERNS.referralUrlPatterns[3].test(
        "https://example.com?referral=ABC",
      ),
    ).toBe(true);
  });

  it("should match short URLs like db.tt", () => {
    expect(
      GENERIC_PATTERNS.referralUrlPatterns[2].test("https://db.tt/abc123"),
    ).toBe(true);
  });

  it("should not match regular URLs", () => {
    const match = GENERIC_PATTERNS.referralUrlPatterns.some((p) =>
      p.test("https://example.com/about-us"),
    );
    expect(match).toBe(false);
  });
});

describe("GENERIC_PATTERNS - codePatterns", () => {
  it("should match 'code: ABC123'", () => {
    const match = "Your code: ABCDEF123".match(
      GENERIC_PATTERNS.codePatterns[0],
    );
    expect(match).not.toBeNull();
    expect(match![1]).toBe("ABCDEF123");
  });

  it("should match 'code-XYZ' dash separator", () => {
    const match = "Enter code-PROMO99 now".match(
      GENERIC_PATTERNS.codePatterns[0],
    );
    expect(match).not.toBeNull();
    expect(match![1]).toBe("PROMO99");
  });

  it("should match 'use code ABC'", () => {
    const match = "Please use code USEME123".match(
      GENERIC_PATTERNS.codePatterns[1],
    );
    expect(match).not.toBeNull();
    expect(match![1]).toBe("USEME123");
  });

  it("should match 'your referral code'", () => {
    const match = "Your referral code: REF456".match(
      GENERIC_PATTERNS.codePatterns[2],
    );
    expect(match).not.toBeNull();
    expect(match![1]).toBe("REF456");
  });

  it("should match 'code' with quotes", () => {
    const match = 'Your code: "QUOTED123"'.match(
      GENERIC_PATTERNS.codePatterns[0],
    );
    expect(match).not.toBeNull();
    expect(match![1]).toBe("QUOTED123");
  });

  it("should not match codes shorter than 4 characters", () => {
    expect(GENERIC_PATTERNS.codePatterns.some((p) => p.test("code: AB"))).toBe(
      false,
    );
  });
});

describe("GENERIC_PATTERNS - rewardPatterns", () => {
  it("should match dollar reward", () => {
    const match = "Get $20 credit".match(GENERIC_PATTERNS.rewardPatterns[0]);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("$20 credit");
  });

  it("should match percentage reward", () => {
    const match = "Earn 15% off".match(GENERIC_PATTERNS.rewardPatterns[1]);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("15%");
  });

  it("should match GB storage reward", () => {
    const match = "Get 500 GB bonus".match(GENERIC_PATTERNS.rewardPatterns[1]);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("500 GB");
  });

  it("should match MB storage reward", () => {
    const match = "Earn 256 MB extra".match(GENERIC_PATTERNS.rewardPatterns[1]);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("256 MB");
  });

  it("should match 'earn' pattern", () => {
    const match = "Earn a free month when you invite".match(
      GENERIC_PATTERNS.rewardPatterns[2],
    );
    expect(match).not.toBeNull();
    expect(match![1].trim()).toBe("a free month");
  });
});

describe("GENERIC_PATTERNS - expiryPatterns", () => {
  it("should match 'expires: date'", () => {
    const match = "Expires: 2026-12-31".match(
      GENERIC_PATTERNS.expiryPatterns[0],
    );
    expect(match).not.toBeNull();
    expect(match![1]).toBe("2026-12-31");
  });

  it("should match 'valid until: date'", () => {
    const match = "Valid until: 01/15/2027".match(
      GENERIC_PATTERNS.expiryPatterns[0],
    );
    expect(match).not.toBeNull();
    expect(match![1]).toBe("01/15/2027");
  });

  it("should match 'ends on date'", () => {
    const match = "Valid until March 15, 2026".match(
      GENERIC_PATTERNS.expiryPatterns[1],
    );
    expect(match).not.toBeNull();
    expect(match![1]).toBe("March 15, 2026");
  });
});

// ============================================================================
// SERVICE_PATTERNS
// ============================================================================

describe("SERVICE_PATTERNS", () => {
  it("should have Uber pattern", () => {
    expect(SERVICE_PATTERNS.uber).toBeDefined();
    expect(SERVICE_PATTERNS.uber.serviceName).toBe("Uber");
    expect(SERVICE_PATTERNS.uber.category).toBe("transportation");
  });

  it("should have Airbnb pattern", () => {
    expect(SERVICE_PATTERNS.airbnb).toBeDefined();
    expect(SERVICE_PATTERNS.airbnb.serviceName).toBe("Airbnb");
    expect(SERVICE_PATTERNS.airbnb.category).toBe("travel");
  });

  it("should have Picnic pattern with German keywords", () => {
    expect(SERVICE_PATTERNS.picnic).toBeDefined();
    expect(SERVICE_PATTERNS.picnic.serviceName).toBe("Picnic");
    expect(SERVICE_PATTERNS.picnic.subject.test("Deine Einladung")).toBe(true);
  });

  it("should have Dropbox pattern", () => {
    expect(SERVICE_PATTERNS.dropbox).toBeDefined();
    expect(SERVICE_PATTERNS.dropbox.serviceName).toBe("Dropbox");
    expect(SERVICE_PATTERNS.dropbox.category).toBe("cloud_storage");
  });

  it("should have Robinhood pattern", () => {
    expect(SERVICE_PATTERNS.robinhood).toBeDefined();
    expect(SERVICE_PATTERNS.robinhood.serviceName).toBe("Robinhood");
    expect(SERVICE_PATTERNS.robinhood.category).toBe("finance");
  });

  it("should have all required fields for each pattern", () => {
    for (const [key, pattern] of Object.entries(SERVICE_PATTERNS)) {
      expect(pattern.sender).toBeDefined();
      expect(pattern.subject).toBeDefined();
      expect(pattern.code).toBeDefined();
      expect(pattern.urlPatterns).toBeDefined();
      expect(pattern.serviceName).toBeDefined();
      expect(pattern.category).toBeDefined();
      expect(pattern.priority).toBeDefined();
    }
  });

  it("should have Uber sender pattern matching @uber.com", () => {
    expect(SERVICE_PATTERNS.uber.sender.test("noreply@uber.com")).toBe(true);
    expect(SERVICE_PATTERNS.uber.sender.test("noreply@lyft.com")).toBe(false);
  });

  it("should have Uber URL patterns matching invite links", () => {
    expect(
      SERVICE_PATTERNS.uber.urlPatterns.some((p) =>
        p.test("https://uber.com/invite/abc123"),
      ),
    ).toBe(true);
  });

  it("should have Airbnb URL patterns matching /c/ links", () => {
    expect(
      SERVICE_PATTERNS.airbnb.urlPatterns.some((p) =>
        p.test("https://airbnb.com/c/johnsmith"),
      ),
    ).toBe(true);
  });
});

// ============================================================================
// DOMAIN_TO_SERVICE
// ============================================================================

describe("DOMAIN_TO_SERVICE", () => {
  it("should map uber.com to uber", () => {
    expect(DOMAIN_TO_SERVICE["uber.com"]).toBe("uber");
  });

  it("should map airbnb.com to airbnb", () => {
    expect(DOMAIN_TO_SERVICE["airbnb.com"]).toBe("airbnb");
  });

  it("should map picnic.app to picnic", () => {
    expect(DOMAIN_TO_SERVICE["picnic.app"]).toBe("picnic");
  });

  it("should map robinhood.com to robinhood", () => {
    expect(DOMAIN_TO_SERVICE["robinhood.com"]).toBe("robinhood");
  });

  it("should map crypto.com to crypto_com", () => {
    expect(DOMAIN_TO_SERVICE["crypto.com"]).toBe("crypto_com");
  });

  it("should map discord.gg to discord", () => {
    expect(DOMAIN_TO_SERVICE["discord.gg"]).toBe("discord");
  });

  it("should map db.tt to dropbox", () => {
    expect(DOMAIN_TO_SERVICE["db.tt"]).toBe("dropbox");
  });

  it("should have entries for major services", () => {
    const expectedDomains = [
      "uber.com",
      "lyft.com",
      "airbnb.com",
      "dropbox.com",
      "robinhood.com",
      "coinbase.com",
      "spotify.com",
      "netflix.com",
      "discord.com",
      "telegram.org",
    ];
    for (const domain of expectedDomains) {
      expect(DOMAIN_TO_SERVICE[domain]).toBeDefined();
    }
  });
});
