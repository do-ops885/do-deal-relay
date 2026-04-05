import { describe, it, expect } from "vitest";
import { parseCommand } from "../../../worker/email/patterns";

describe("parseCommand - ADD", () => {
  it("should parse ADD from recipient address", () => {
    const result = parseCommand({
      subject: "Uber referral",
      text: "Service: Uber\nCode: ABC123\nLink: https://uber.com/invite/abc123\nReward: $20 credit",
      to: ["add@do-deal.app"],
    });
    expect(result.type).toBe("ADD");
    expect(result.service).toBe("uber");
    expect(result.code).toBe("abc123");
    expect(result.referralUrl).toBe("https://uber.com/invite/abc123");
    expect(result.reward).toBe("$20 credit");
  });

  it("should parse ADD from subject prefix 'add '", () => {
    const result = parseCommand({
      subject: "add Picnic referral",
      text: "Code: PICNIC2026\nLink: https://picnic.app/de/freunde-rabatt/PICNIC2026",
      to: ["referrals@do-deal.app"],
    });
    expect(result.type).toBe("ADD");
    expect(result.service).toBe("picnic referral");
    expect(result.code).toBe("picnic2026");
  });

  it("should parse ADD from subject prefix 'add:'", () => {
    const result = parseCommand({
      subject: "add: Airbnb invite",
      text: "Code: AIRBNB99\nReward: $40 credit",
      to: ["referrals@do-deal.app"],
    });
    expect(result.type).toBe("ADD");
    expect(result.service).toBe("airbnb invite");
    expect(result.code).toBe("airbnb99");
  });

  it("should extract expiry from ADD command body", () => {
    const result = parseCommand({
      subject: "add Dropbox",
      text: "Code: DROP123\nExpires: 2026-12-31",
      to: ["add@do-deal.app"],
    });
    expect(result.type).toBe("ADD");
    expect(result.expiry).toBe("2026-12-31");
  });

  it("should extract category from ADD command body", () => {
    const result = parseCommand({
      subject: "add Spotify",
      text: "Code: SPOTIFY1\nCategory: entertainment",
      to: ["add@do-deal.app"],
    });
    expect(result.category).toBe("entertainment");
  });

  it("should extract notes from ADD command body", () => {
    const result = parseCommand({
      subject: "add Uber",
      text: "Code: UBER1\nNotes: Works for new users only",
      to: ["add@do-deal.app"],
    });
    expect(result.notes).toBe("works for new users only");
  });

  it("should extract reward alias 'bonus'", () => {
    const result = parseCommand({
      subject: "add Coinbase",
      text: "Code: COIN1\nBonus: $10 in BTC",
      to: ["add@do-deal.app"],
    });
    expect(result.reward).toBe("$10 in btc");
  });

  it("should extract URL alias 'url'", () => {
    const result = parseCommand({
      subject: "add Robinhood",
      text: "Code: RH1\nUrl: https://join.robinhood.com/abc",
      to: ["add@do-deal.app"],
    });
    expect(result.referralUrl).toBe("https://join.robinhood.com/abc");
  });

  it("should extract referral URL alias", () => {
    const result = parseCommand({
      subject: "add Lyft",
      text: "Code: LYFT1\nReferral Url: https://lyft.com/i/xyz",
      to: ["add@do-deal.app"],
    });
    expect(result.referralUrl).toBe("https://lyft.com/i/xyz");
  });
});

describe("parseCommand - DEACTIVATE", () => {
  it("should parse DEACTIVATE from recipient address", () => {
    const result = parseCommand({
      subject: "Uber ABC123",
      text: "Reason: Expired code",
      to: ["deactivate@do-deal.app"],
    });
    expect(result.type).toBe("DEACTIVATE");
    expect(result.service).toBe("uber");
    expect(result.code).toBe("abc123");
    expect(result.reason).toBe("expired code");
  });

  it("should parse DEACTIVATE from subject prefix", () => {
    const result = parseCommand({
      subject: "deactivate: Netflix NETFLX99",
      text: "",
      to: ["referrals@do-deal.app"],
    });
    expect(result.type).toBe("DEACTIVATE");
    expect(result.service).toBe("netflix");
    expect(result.code).toBe("netflx99");
  });

  it("should use default reason when not provided", () => {
    const result = parseCommand({
      subject: "deactivate Spotify",
      text: "",
      to: ["deactivate@do-deal.app"],
    });
    expect(result.reason).toBe("user_request");
  });

  it("should parse DEACTIVATE with 'deactivate ' prefix (space)", () => {
    const result = parseCommand({
      subject: "deactivate DoorDash DD123",
      text: "Notes: Moved to another city",
      to: ["referrals@do-deal.app"],
    });
    expect(result.type).toBe("DEACTIVATE");
    expect(result.service).toBe("doordash");
    expect(result.notes).toBe("moved to another city");
  });
});

describe("parseCommand - SEARCH", () => {
  it("should parse SEARCH from recipient address", () => {
    const result = parseCommand({
      subject: "uber rides",
      text: "",
      to: ["search@do-deal.app"],
    });
    expect(result.type).toBe("SEARCH");
    expect(result.query).toBe("uber rides");
  });

  it("should parse SEARCH from subject prefix 'search '", () => {
    const result = parseCommand({
      subject: "search trading referrals",
      text: "",
      to: ["referrals@do-deal.app"],
    });
    expect(result.type).toBe("SEARCH");
    expect(result.query).toBe("trading referrals");
  });

  it("should parse SEARCH from subject prefix 'search:'", () => {
    const result = parseCommand({
      subject: "search: crypto bonuses",
      text: "",
      to: ["referrals@do-deal.app"],
    });
    expect(result.type).toBe("SEARCH");
    expect(result.query).toBe("crypto bonuses");
  });
});

describe("parseCommand - DIGEST", () => {
  it("should parse DIGEST from recipient with daily frequency", () => {
    const result = parseCommand({
      subject: "daily",
      text: "",
      to: ["digest@do-deal.app"],
    });
    expect(result.type).toBe("DIGEST");
    expect(result.frequency).toBe("daily");
  });

  it("should parse DIGEST from recipient with weekly frequency", () => {
    const result = parseCommand({
      subject: "weekly",
      text: "",
      to: ["digest@do-deal.app"],
    });
    expect(result.type).toBe("DIGEST");
    expect(result.frequency).toBe("weekly");
  });

  it("should parse DIGEST from recipient with monthly frequency", () => {
    const result = parseCommand({
      subject: "monthly",
      text: "",
      to: ["digest@do-deal.app"],
    });
    expect(result.type).toBe("DIGEST");
    expect(result.frequency).toBe("monthly");
  });

  it("should default to weekly frequency", () => {
    const result = parseCommand({
      subject: "send digest",
      text: "",
      to: ["digest@do-deal.app"],
    });
    expect(result.type).toBe("DIGEST");
    expect(result.frequency).toBe("weekly");
  });

  it("should parse DIGEST from subject with 'summary'", () => {
    const result = parseCommand({
      subject: "weekly summary please",
      text: "",
      to: ["referrals@do-deal.app"],
    });
    expect(result.type).toBe("DIGEST");
    expect(result.frequency).toBe("weekly");
  });
});

describe("parseCommand - HELP", () => {
  it("should parse HELP from recipient address", () => {
    const result = parseCommand({
      subject: "Need help",
      text: "",
      to: ["help@do-deal.app"],
    });
    expect(result.type).toBe("HELP");
  });

  it("should parse HELP from subject containing 'help'", () => {
    const result = parseCommand({
      subject: "I need help with referrals",
      text: "",
      to: ["referrals@do-deal.app"],
    });
    expect(result.type).toBe("HELP");
  });

  it("should parse HELP from subject with question mark", () => {
    const result = parseCommand({
      subject: "How does this work?",
      text: "",
      to: ["referrals@do-deal.app"],
    });
    expect(result.type).toBe("HELP");
  });
});

describe("parseCommand - FORWARDED", () => {
  it("should detect forwarded from 'fw:' prefix", () => {
    const result = parseCommand({
      subject: "fw: Uber referral",
      text: "",
      to: ["referrals@do-deal.app"],
    });
    expect(result.type).toBe("FORWARDED");
  });

  it("should detect forwarded from 'fwd:' prefix", () => {
    const result = parseCommand({
      subject: "fwd: Airbnb invite",
      text: "",
      to: ["referrals@do-deal.app"],
    });
    expect(result.type).toBe("FORWARDED");
  });

  it("should detect forwarded from 'forward' prefix", () => {
    const result = parseCommand({
      subject: "Forward: Dropbox extra space",
      text: "",
      to: ["referrals@do-deal.app"],
    });
    expect(result.type).toBe("FORWARDED");
  });

  it("should default to FORWARDED for unrecognized emails", () => {
    const result = parseCommand({
      subject: "Random email subject",
      text: "Some email body content here.",
      to: ["referrals@do-deal.app"],
    });
    expect(result.type).toBe("FORWARDED");
  });
});
