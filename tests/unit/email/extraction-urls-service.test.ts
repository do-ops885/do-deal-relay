import { describe, it, expect } from "vitest";
import {
  extractUrls,
  extractReferralUrl,
  detectService,
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

describe("extractUrls", () => {
  it("should extract a single URL from text", () => {
    const urls = extractUrls("Check this link: https://example.com/ref/ABC123");
    expect(urls).toEqual(["https://example.com/ref/ABC123"]);
  });

  it("should extract multiple URLs", () => {
    const urls = extractUrls(
      "Visit https://uber.com/invite/abc and https://lyft.com/i/xyz",
    );
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe("https://uber.com/invite/abc");
    expect(urls[1]).toBe("https://lyft.com/i/xyz");
  });

  it("should clean trailing punctuation from URLs", () => {
    const urls = extractUrls("Go to https://example.com/ref/abc.");
    expect(urls).toEqual(["https://example.com/ref/abc"]);
  });

  it("should handle URLs in HTML with angle brackets", () => {
    const urls = extractUrls('<a href="https://example.com/ref/abc">Link</a>');
    expect(urls).toEqual(["https://example.com/ref/abc"]);
  });

  it("should decode HTML entities in URLs", () => {
    const urls = extractUrls("https://example.com/ref?a=1&amp;b=2");
    expect(urls).toEqual(["https://example.com/ref?a=1&b=2"]);
  });

  it("should return empty array for text without URLs", () => {
    expect(extractUrls("No URLs here, just text.")).toEqual([]);
  });

  it("should return empty array for empty string", () => {
    expect(extractUrls("")).toEqual([]);
  });

  it("should handle URLs with query parameters", () => {
    const urls = extractUrls(
      "https://app.example.com/invite?ref=ABC123&source=email",
    );
    expect(urls).toEqual([
      "https://app.example.com/invite?ref=ABC123&source=email",
    ]);
  });

  it("should handle URLs with trailing commas and semicolons", () => {
    const urls = extractUrls("Links: https://a.com/x, https://b.com/y; done.");
    expect(urls).toEqual(["https://a.com/x", "https://b.com/y"]);
  });

  it("should reject invalid URLs", () => {
    expect(extractUrls("not a url https:// https://[invalid]")).toEqual([]);
  });

  it("should handle http URLs", () => {
    expect(extractUrls("http://example.com/ref/abc")).toEqual([
      "http://example.com/ref/abc",
    ]);
  });
});

describe("extractReferralUrl", () => {
  it("should extract referral URL without service pattern", () => {
    const email = makeEmail({
      text: "Join Uber with this link: https://uber.com/invite/abc123def",
    });
    const result = extractReferralUrl(email);
    expect(result.url).toBe("https://uber.com/invite/abc123def");
    expect(result.code).toBeNull();
  });

  it("should extract referral URL with query parameter code", () => {
    const email = makeEmail({
      text: "Share: https://example.com/ref?r=CODE456",
    });
    const result = extractReferralUrl(email);
    expect(result.url).toBe("https://example.com/ref?r=CODE456");
    expect(result.code).toBe("CODE456");
  });

  it("should return nulls for email without referral URLs", () => {
    const email = makeEmail({ text: "Just a normal email with no links." });
    const result = extractReferralUrl(email);
    expect(result.url).toBeNull();
    expect(result.code).toBeNull();
  });

  it("should extract from HTML content", () => {
    const email = makeEmail({
      html: '<a href="https://uber.com/invite/xyz789">Invite</a>',
    });
    const result = extractReferralUrl(email);
    expect(result.url).toBe("https://uber.com/invite/xyz789");
  });

  it("should extract Dropbox short URL", () => {
    const email = makeEmail({
      text: "Get extra space: https://db.tt/abc123xyz",
    });
    const result = extractReferralUrl(email);
    expect(result.url).toBe("https://db.tt/abc123xyz");
  });
});

describe("detectService", () => {
  it("should detect Uber from sender domain", () => {
    expect(detectService(makeEmail({ from: "noreply@uber.com" }))).toBe("uber");
  });

  it("should detect Airbnb from sender domain", () => {
    expect(detectService(makeEmail({ from: "noreply@airbnb.com" }))).toBe(
      "airbnb",
    );
  });

  it("should detect Picnic from sender domain", () => {
    expect(detectService(makeEmail({ from: "invite@picnic.app" }))).toBe(
      "picnic",
    );
  });

  it("should detect Lyft from sender domain", () => {
    expect(detectService(makeEmail({ from: "hello@lyft.com" }))).toBe("lyft");
  });

  it("should detect DoorDash from sender domain", () => {
    expect(detectService(makeEmail({ from: "noreply@doordash.com" }))).toBe(
      "doordash",
    );
  });

  it("should detect Robinhood from sender domain", () => {
    expect(
      detectService(makeEmail({ from: "notifications@robinhood.com" })),
    ).toBe("robinhood");
  });

  it("should detect Coinbase from sender domain", () => {
    expect(detectService(makeEmail({ from: "notify@coinbase.com" }))).toBe(
      "coinbase",
    );
  });

  it("should detect service from subject line", () => {
    expect(
      detectService(
        makeEmail({
          from: "unknown@sender.com",
          subject: "Your Spotify Premium invite",
        }),
      ),
    ).toBe("spotify");
  });

  it("should detect service from body text", () => {
    expect(
      detectService(
        makeEmail({
          from: "unknown@sender.com",
          text: "Share your Netflix referral with friends!",
        }),
      ),
    ).toBe("netflix");
  });

  it("should return unknown for unrecognized service", () => {
    expect(
      detectService(
        makeEmail({
          from: "noreply@randomservice.com",
          subject: "Some random email",
        }),
      ),
    ).toBe("unknown");
  });

  it("should detect discord from domain", () => {
    expect(detectService(makeEmail({ from: "noreply@discord.com" }))).toBe(
      "discord",
    );
  });

  it("should detect telegram from domain", () => {
    expect(detectService(makeEmail({ from: "noreply@telegram.org" }))).toBe(
      "telegram",
    );
  });
});
