import { describe, it, expect } from "vitest";
import {
  extractCode,
  extractReward,
  extractExpiry,
  extractReferralFromEmail,
  detectEmailType,
} from "../../../worker/email/extraction";
import type { ParsedEmail } from "../../../worker/email/types";

function makeEmail(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    from: "user@gmail.com",
    to: ["referrals@do-deal.app"],
    subject: "Your referral invite",
    text: "",
    html: "",
    ...overrides,
  };
}

describe("extractCode", () => {
  it("should extract code with 'code:' pattern", () => {
    const email = makeEmail({
      text: "Your referral code: ABCDEF123. Share it now!",
    });
    expect(extractCode(email)).toBe("ABCDEF123");
  });

  it("should extract code with 'use code' pattern", () => {
    const email = makeEmail({ text: "Use code PROMO99 to get started." });
    expect(extractCode(email)).toBe("PROMO99");
  });

  it("should extract code with 'your referral code' pattern", () => {
    const email = makeEmail({ text: "Your referral code: REF456" });
    expect(extractCode(email)).toBe("REF456");
  });

  it("should return null when no code found", () => {
    const email = makeEmail({ text: "Just a regular email." });
    expect(extractCode(email)).toBeNull();
  });

  it("should extract code from HTML content", () => {
    const email = makeEmail({
      html: "<p>Your invite code is INVITE2026XYZ</p>",
    });
    const code = extractCode(email);
    expect(code).toBeTruthy();
    expect(code!.length).toBeGreaterThan(2);
  });

  it("should extract code with quotes around it", () => {
    const email = makeEmail({ text: 'Your code: "QUOTED123"' });
    expect(extractCode(email)).toBe("QUOTED123");
  });
});

describe("extractReward", () => {
  it("should extract dollar reward", () => {
    const email = makeEmail({
      text: "Earn $20 credit when your friend signs up.",
    });
    expect(extractReward(email)).toBe("$20 credit");
  });

  it("should extract percentage reward", () => {
    const email = makeEmail({ text: "Get 15% off your next purchase!" });
    expect(extractReward(email)).toBe("15%");
  });

  it("should extract storage reward", () => {
    const email = makeEmail({
      text: "Get 500 MB of extra space for each referral.",
    });
    expect(extractReward(email)).toBe("500 MB");
  });

  it("should extract GB reward", () => {
    const email = makeEmail({ text: "Earn 1 GB bonus storage!" });
    expect(extractReward(email)).toBe("1 GB");
  });

  it("should return null when no reward found", () => {
    const email = makeEmail({ text: "Just a notification." });
    expect(extractReward(email)).toBeNull();
  });

  it("should extract reward with 'earn' pattern", () => {
    const email = makeEmail({
      text: "Earn a free month when you invite a friend by December.",
    });
    expect(extractReward(email)).toBe("a free month");
  });
});

describe("extractExpiry", () => {
  it("should parse MM/DD/YYYY format", () => {
    const email = makeEmail({ text: "Offer expires: 12/25/2026" });
    expect(extractExpiry(email)).toBe("2026-12-25");
  });

  it("should parse DD.MM.YYYY format (European)", () => {
    const email = makeEmail({ text: "Gültig bis: 31.12.2026" });
    expect(extractExpiry(email)).toBe("2026-12-31");
  });

  it("should parse Month DD, YYYY format", () => {
    const email = makeEmail({ text: "Valid until: March 15, 2026" });
    expect(extractExpiry(email)).toBe("2026-03-15");
  });

  it("should parse YYYY-MM-DD format", () => {
    const email = makeEmail({ text: "Expires: 2026-06-30" });
    expect(extractExpiry(email)).toBe("2026-06-30");
  });

  it("should parse 'valid until' with date", () => {
    const email = makeEmail({ text: "Valid until: 01/15/2027" });
    expect(extractExpiry(email)).toBe("2027-01-15");
  });

  it("should return null for invalid date", () => {
    const email = makeEmail({ text: "Expires: not-a-date" });
    expect(extractExpiry(email)).toBeNull();
  });

  it("should return null when no expiry found", () => {
    const email = makeEmail({ text: "No expiry mentioned." });
    expect(extractExpiry(email)).toBeNull();
  });
});

describe("extractReferralFromEmail", () => {
  it("should extract full referral info from Uber email", () => {
    const email = makeEmail({
      from: "noreply@uber.com",
      subject: "Get a free ride with Uber",
      text: "Share your invite: https://uber.com/invite/abc123\nYour code: RIDE2026\nEarn $20 credit. Expires: 2026-12-31",
    });
    const result = extractReferralFromEmail(email);
    expect(result.service).toBe("Uber");
    expect(result.code).toBe("abc123");
    expect(result.referralUrl).toBe("https://uber.com/invite/abc123");
    expect(result.confidence).toBe(0.9);
    expect(result.method).toBe("service-specific");
  });

  it("should extract from Airbnb email", () => {
    const email = makeEmail({
      from: "noreply@airbnb.com",
      subject: "Invite your friends to Airbnb",
      text: "Share: https://airbnb.com/c/johndoe99\nGet $40 credit when they book.",
    });
    const result = extractReferralFromEmail(email);
    expect(result.service).toBe("Airbnb");
    expect(result.referralUrl).toBe("https://airbnb.com/c/johndoe99");
    expect(result.confidence).toBe(0.9);
  });

  it("should fall back to generic extraction for unknown service", () => {
    const email = makeEmail({
      from: "unknown@random.com",
      text: "Check this: https://example.com/ref?r=CODE123\nCode: CODE123",
    });
    const result = extractReferralFromEmail(email);
    expect(result.method).toBe("generic");
    expect(result.confidence).toBe(0.6);
    expect(result.code).toBe("CODE123");
  });

  it("should return manual method when nothing found", () => {
    const email = makeEmail({
      from: "noreply@unknown.com",
      text: "Just a regular email with nothing special.",
    });
    const result = extractReferralFromEmail(email);
    expect(result.method).toBe("manual");
    expect(result.confidence).toBe(0);
    expect(result.code).toBeNull();
    expect(result.referralUrl).toBeNull();
  });

  it("should use body code when URL code not available", () => {
    const email = makeEmail({
      from: "noreply@uber.com",
      subject: "Free ride invite",
      text: "Your code: BODYCODE123. Visit https://uber.com/promo",
    });
    const result = extractReferralFromEmail(email);
    expect(result.code).toBe("BODYCODE123");
  });

  it("should detect Picnic from German email", () => {
    const email = makeEmail({
      from: "invite@picnic.app",
      subject: "Deine Einladung",
      text: "Dein Code: PICNIC2026. Teile diesen Link: https://picnic.app/de/freunde-rabatt/PICNIC2026",
    });
    const result = extractReferralFromEmail(email);
    expect(result.service).toBe("Picnic");
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });
});

describe("detectEmailType", () => {
  it("should detect ADD command from recipient address", () => {
    expect(detectEmailType(makeEmail({ to: ["add@do-deal.app"] }))).toBe("ADD");
  });

  it("should detect DEACTIVATE command from recipient", () => {
    expect(detectEmailType(makeEmail({ to: ["deactivate@do-deal.app"] }))).toBe(
      "DEACTIVATE",
    );
  });

  it("should detect SEARCH command from recipient", () => {
    expect(detectEmailType(makeEmail({ to: ["search@do-deal.app"] }))).toBe(
      "SEARCH",
    );
  });

  it("should detect DIGEST command from recipient", () => {
    expect(detectEmailType(makeEmail({ to: ["digest@do-deal.app"] }))).toBe(
      "DIGEST",
    );
  });

  it("should detect HELP command from recipient", () => {
    expect(detectEmailType(makeEmail({ to: ["help@do-deal.app"] }))).toBe(
      "HELP",
    );
  });

  it("should detect ADD command from subject prefix", () => {
    expect(detectEmailType(makeEmail({ subject: "Add: Uber referral" }))).toBe(
      "ADD",
    );
  });

  it("should detect DEACTIVATE command from subject prefix", () => {
    expect(
      detectEmailType(makeEmail({ subject: "Deactivate: Uber ABC123" })),
    ).toBe("DEACTIVATE");
  });

  it("should detect SEARCH command from subject prefix", () => {
    expect(detectEmailType(makeEmail({ subject: "Search: uber rides" }))).toBe(
      "SEARCH",
    );
  });

  it("should detect DIGEST command from subject prefix", () => {
    expect(detectEmailType(makeEmail({ subject: "Digest: weekly" }))).toBe(
      "DIGEST",
    );
  });

  it("should detect HELP from subject", () => {
    expect(detectEmailType(makeEmail({ subject: "Help me" }))).toBe("HELP");
  });

  it("should detect FORWARDED from FW: prefix", () => {
    expect(detectEmailType(makeEmail({ subject: "FW: Uber referral" }))).toBe(
      "FORWARDED",
    );
  });

  it("should detect FORWARDED from FWD: prefix", () => {
    expect(detectEmailType(makeEmail({ subject: "FWD: Airbnb invite" }))).toBe(
      "FORWARDED",
    );
  });

  it("should detect FORWARDED from 'forwarded' prefix", () => {
    expect(
      detectEmailType(makeEmail({ subject: "Forwarded: Dropbox invite" })),
    ).toBe("FORWARDED");
  });

  it("should detect FORWARDED from German 'weitergeleitet'", () => {
    expect(
      detectEmailType(
        makeEmail({ subject: "Weitergeleitet: Picnic Einladung" }),
      ),
    ).toBe("FORWARDED");
  });

  it("should detect FORWARDED from referral keywords in body", () => {
    const email = makeEmail({
      subject: "Check this out",
      text: "Here is my referral code and bonus credit link",
    });
    expect(detectEmailType(email)).toBe("FORWARDED");
  });

  it("should return UNKNOWN for unrecognized email", () => {
    const email = makeEmail({
      subject: "Meeting tomorrow",
      text: "Let's discuss the project.",
    });
    expect(detectEmailType(email)).toBe("UNKNOWN");
  });

  it("should handle empty to array", () => {
    expect(detectEmailType(makeEmail({ to: [] }))).not.toBe("ADD");
  });
});
