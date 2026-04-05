import { describe, it, expect, vi } from "vitest";
import {
  validateSecurity,
  sanitizeContent,
  getSenderDomain,
  checkSuspiciousPatterns,
} from "../../../worker/email/security";
import type { ParsedEmail } from "../../../worker/email/types";
import type { Env } from "../../../worker/types";

function makeEmail(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    from: "user@gmail.com",
    to: ["referrals@do-deal.app"],
    subject: "Your referral invite",
    text: "This is a legitimate referral email with enough content to pass validation checks. It contains a referral code and a link to share with friends for a bonus credit reward.",
    html: "<p>This is a legitimate referral email with enough content to pass validation checks.</p>",
    ...overrides,
  };
}

function makeMockEnv(kvOverrides: Record<string, string> = {}): Env {
  const kvStore: Record<string, string> = { ...kvOverrides };
  const mockKV = {
    get: vi.fn(async (key: string) => kvStore[key] ?? null),
    put: vi.fn(async (key: string, value: string) => {
      kvStore[key] = value;
    }),
  } as unknown as Env["DEALS_SOURCES"];
  return {
    DEALS_PROD: mockKV,
    DEALS_STAGING: mockKV,
    DEALS_LOG: mockKV,
    DEALS_LOCK: mockKV,
    DEALS_SOURCES: mockKV,
    ENVIRONMENT: "test",
    GITHUB_REPO: "test/repo",
    NOTIFICATION_THRESHOLD: "0.5",
  } as Env;
}

describe("validateSecurity - Spam detection", () => {
  it("should flag email with blacklisted pattern 'viagra'", async () => {
    const email = makeEmail({
      subject: "Buy viagra now!!!",
      text: "Best prices on viagra online. Click here now! Winner winner! Nigerian prince needs help. Lottery winner! spam spam spam!!!!!!",
    });
    const result = await validateSecurity(email, makeMockEnv());
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("spam");
  });

  it("should flag email with 'lottery' pattern", async () => {
    const email = makeEmail({
      subject: "You won the lottery!!!",
      text: "Congratulations! You are the lottery winner. Nigerian prince. spam spam spam!!!!!!",
    });
    const result = await validateSecurity(email, makeMockEnv());
    expect(result.valid).toBe(false);
  });

  it("should flag email with 'nigerian' pattern", async () => {
    const email = makeEmail({
      subject: "Nigerian prince needs help!!!",
      text: "I am a Nigerian prince and need your assistance. spam spam spam!!!!!!",
    });
    const result = await validateSecurity(email, makeMockEnv());
    expect(result.valid).toBe(false);
  });

  it("should flag email with excessive caps", async () => {
    const email = makeEmail({
      subject: "AMAZING REFERRAL BONUS FOR YOU TODAY",
      text: "This is a legitimate referral email with enough content to pass validation checks. It contains a referral code and a link to share with friends for a bonus credit reward.",
    });
    const result = await validateSecurity(email, makeMockEnv());
    expect(result.spamScore).toBeGreaterThan(0);
  });

  it("should flag email with excessive exclamation marks", async () => {
    const email = makeEmail({
      subject: "Get your bonus!!!!!!",
      text: "This is a legitimate referral email with enough content to pass validation checks. It contains a referral code and a link to share with friends for a bonus credit reward.",
    });
    const result = await validateSecurity(email, makeMockEnv());
    expect(result.spamScore).toBeGreaterThan(0);
  });

  it("should flag email with suspicious URL shorteners", async () => {
    const email = makeEmail({
      subject: "Check this link",
      text: "Click here: https://bit.ly/abc123 and https://tinyurl.com/xyz",
    });
    const result = await validateSecurity(email, makeMockEnv());
    expect(result.spamScore).toBeGreaterThan(0);
  });

  it("should flag HTML-only emails", async () => {
    const email = makeEmail({
      text: undefined,
      html: "<p>This is HTML only with enough content to pass the minimum length validation check for emails.</p>",
    });
    const result = await validateSecurity(email, makeMockEnv());
    expect(result.spamScore).toBeGreaterThan(0);
  });

  it("should flag suspicious sender domain with many digits", async () => {
    const email = makeEmail({ from: "user@12345678.com" });
    const result = await validateSecurity(email, makeMockEnv());
    expect(result.spamScore).toBeGreaterThan(0);
  });

  it("should allow legitimate referral email", async () => {
    const email = makeEmail({
      from: "invite@uber.com",
      subject: "Your Uber referral invite",
      text: "Share your referral code ABC123 with friends. Get $20 credit when they sign up. https://uber.com/invite/abc123",
    });
    const result = await validateSecurity(email, makeMockEnv());
    expect(result.valid).toBe(true);
  });

  it("should cap spam score at 1.0", async () => {
    const email = makeEmail({
      from: "user@123456789.com",
      subject: "VIAGRA LOTTERY WINNER!!!!!!",
      text: "Buy viagra now! You won the lottery! Nigerian prince needs help! Winner winner! bit.ly/xxx tinyurl.com/yyy",
    });
    const result = await validateSecurity(email, makeMockEnv());
    expect(result.spamScore).toBeLessThanOrEqual(1);
  });
});

describe("validateSecurity - Content validation", () => {
  it("should reject email with no content", async () => {
    const email = makeEmail({ text: "", html: "" });
    const result = await validateSecurity(email, makeMockEnv());
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("no content");
  });

  it("should reject email with too short content", async () => {
    const email = makeEmail({ text: "Short.", html: "" });
    const result = await validateSecurity(email, makeMockEnv());
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("too short");
  });

  it("should reject email with invalid sender format", async () => {
    const email = makeEmail({ from: "not-an-email" });
    const result = await validateSecurity(email, makeMockEnv());
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Invalid sender");
  });
});

describe("sanitizeContent", () => {
  it("should escape HTML angle brackets", () => {
    const result = sanitizeContent("<script>alert('xss')</script>");
    expect(result).toBe(
      "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;&#x2F;script&gt;",
    );
  });

  it("should escape double quotes", () => {
    expect(sanitizeContent('He said "hello"')).toBe(
      "He said &quot;hello&quot;",
    );
  });

  it("should escape single quotes", () => {
    expect(sanitizeContent("It's a test")).toBe("It&#x27;s a test");
  });

  it("should escape forward slashes", () => {
    expect(sanitizeContent("path/to/file")).toBe("path&#x2F;to&#x2F;file");
  });

  it("should handle plain text without special chars", () => {
    expect(sanitizeContent("Hello World")).toBe("Hello World");
  });

  it("should handle empty string", () => {
    expect(sanitizeContent("")).toBe("");
  });

  it("should escape multiple special characters", () => {
    expect(sanitizeContent('<a href="test">link</a>')).toBe(
      "&lt;a href=&quot;test&quot;&gt;link&lt;&#x2F;a&gt;",
    );
  });

  it("should prevent XSS injection attempts", () => {
    const result = sanitizeContent('<img src=x onerror="alert(1)">');
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
    expect(result).not.toContain('"');
  });
});

describe("getSenderDomain", () => {
  it("should extract domain from valid email", () => {
    expect(getSenderDomain("user@gmail.com")).toBe("gmail.com");
  });

  it("should handle subdomains", () => {
    expect(getSenderDomain("user@mail.google.com")).toBe("mail.google.com");
  });

  it("should return lowercase domain", () => {
    expect(getSenderDomain("user@GMAIL.COM")).toBe("gmail.com");
  });

  it("should return null for invalid email", () => {
    expect(getSenderDomain("not-an-email")).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(getSenderDomain("")).toBeNull();
  });

  it("should handle email with plus addressing", () => {
    expect(getSenderDomain("user+tag@gmail.com")).toBe("gmail.com");
  });
});

describe("checkSuspiciousPatterns", () => {
  it("should detect urgency language", () => {
    const email = makeEmail({
      subject: "Urgent: Act now!",
      text: "This is a legitimate referral email with enough content to pass validation checks.",
    });
    expect(checkSuspiciousPatterns(email)).toContain(
      "Urgency language detected",
    );
  });

  it("should detect 'limited time' urgency", () => {
    const email = makeEmail({
      subject: "Limited time offer",
      text: "This is a legitimate referral email with enough content to pass validation checks.",
    });
    expect(checkSuspiciousPatterns(email)).toContain(
      "Urgency language detected",
    );
  });

  it("should detect 'expires today' urgency", () => {
    const email = makeEmail({
      subject: "Offer expires today",
      text: "This is a legitimate referral email with enough content to pass validation checks.",
    });
    expect(checkSuspiciousPatterns(email)).toContain(
      "Urgency language detected",
    );
  });

  it("should detect phishing indicators", () => {
    const email = makeEmail({
      subject: "Verify your account",
      text: "This is a legitimate referral email with enough content to pass validation checks.",
    });
    expect(checkSuspiciousPatterns(email)).toContain(
      "Potential phishing indicators",
    );
  });

  it("should detect 'confirm your' phishing", () => {
    const email = makeEmail({
      subject: "Confirm your details",
      text: "This is a legitimate referral email with enough content to pass validation checks.",
    });
    expect(checkSuspiciousPatterns(email)).toContain(
      "Potential phishing indicators",
    );
  });

  it("should detect 'update payment' phishing", () => {
    const email = makeEmail({
      subject: "Update payment info",
      text: "This is a legitimate referral email with enough content to pass validation checks.",
    });
    expect(checkSuspiciousPatterns(email)).toContain(
      "Potential phishing indicators",
    );
  });

  it("should detect excessive links", () => {
    const links = Array(12).fill("https://example.com/link").join(" ");
    const email = makeEmail({
      subject: "Check these links",
      text: links,
    });
    expect(checkSuspiciousPatterns(email)).toContain(
      "Excessive number of links",
    );
  });

  it("should return empty array for clean email", () => {
    const email = makeEmail({
      subject: "Your referral invite",
      text: "Share your code with friends for a bonus.",
    });
    expect(checkSuspiciousPatterns(email)).toEqual([]);
  });

  it("should detect multiple patterns at once", () => {
    const links = Array(12).fill("https://example.com/link").join(" ");
    const email = makeEmail({
      subject: "URGENT: Verify your account now!",
      text: links,
    });
    expect(checkSuspiciousPatterns(email).length).toBeGreaterThanOrEqual(2);
  });
});
