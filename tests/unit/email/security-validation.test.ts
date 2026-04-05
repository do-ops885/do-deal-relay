import { describe, it, expect, vi } from "vitest";
import {
  validateSecurity,
  isWhitelisted,
  isBlacklisted,
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

describe("validateSecurity - Happy paths", () => {
  it("should pass validation for a legitimate email", async () => {
    const result = await validateSecurity(makeEmail(), makeMockEnv());
    expect(result.valid).toBe(true);
    expect(result.dkimValid).toBe(true);
    expect(result.spfValid).toBe(true);
  });

  it("should pass when DKIM is explicitly valid", async () => {
    const result = await validateSecurity(
      makeEmail({ dkimValid: true }),
      makeMockEnv(),
    );
    expect(result.valid).toBe(true);
    expect(result.dkimValid).toBe(true);
  });

  it("should pass when SPF is explicitly valid", async () => {
    const result = await validateSecurity(
      makeEmail({ spfValid: true }),
      makeMockEnv(),
    );
    expect(result.valid).toBe(true);
    expect(result.spfValid).toBe(true);
  });

  it("should pass with DKIM-Signature header", async () => {
    const email = makeEmail({
      headers: { "DKIM-Signature": "v=1; a=rsa-sha256; d=uber.com;" },
    });
    const result = await validateSecurity(email, makeMockEnv());
    expect(result.valid).toBe(true);
  });

  it("should pass with lowercase dkim-signature header", async () => {
    const email = makeEmail({
      headers: { "dkim-signature": "v=1; a=rsa-sha256;" },
    });
    const result = await validateSecurity(email, makeMockEnv());
    expect(result.valid).toBe(true);
  });

  it("should pass with SPF pass header", async () => {
    const email = makeEmail({
      headers: {
        "Received-SPF": "pass (google.com: domain of user@gmail.com)",
      },
    });
    const result = await validateSecurity(email, makeMockEnv());
    expect(result.valid).toBe(true);
  });

  it("should track rate limit counter in KV", async () => {
    const env = makeMockEnv();
    await validateSecurity(makeEmail(), env);
    expect(env.DEALS_SOURCES.put).toHaveBeenCalled();
  });
});

describe("validateSecurity - DKIM/SPF failures", () => {
  it("should fail when DKIM is explicitly invalid", async () => {
    const result = await validateSecurity(
      makeEmail({ dkimValid: false }),
      makeMockEnv(),
    );
    expect(result.valid).toBe(false);
    expect(result.dkimValid).toBe(false);
    expect(result.reason).toContain("DKIM");
  });

  it("should fail when SPF is explicitly invalid", async () => {
    const result = await validateSecurity(
      makeEmail({ spfValid: false }),
      makeMockEnv(),
    );
    expect(result.valid).toBe(false);
    expect(result.spfValid).toBe(false);
    expect(result.reason).toContain("SPF");
  });

  it("should fail when SPF header contains fail", async () => {
    const email = makeEmail({
      headers: { "Received-SPF": "fail (domain does not designate)" },
    });
    const result = await validateSecurity(email, makeMockEnv());
    expect(result.valid).toBe(false);
    expect(result.spfValid).toBe(false);
  });
});

describe("validateSecurity - Rate limiting", () => {
  it("should reject when rate limit exceeded", async () => {
    const kvStore: Record<string, string> = {};
    const sender = "spammer@evil.com";
    const today = new Date().toISOString().split("T")[0];
    kvStore[`email_ratelimit:${sender}:${today}`] = "50";

    const mockKV = {
      get: vi.fn(async (k: string) => kvStore[k] ?? null),
      put: vi.fn(async (k: string, v: string) => {
        kvStore[k] = v;
      }),
    };
    const env = { DEALS_SOURCES: mockKV } as unknown as Env;

    const result = await validateSecurity(makeEmail({ from: sender }), env);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Rate limit");
  });

  it("should allow when under rate limit", async () => {
    const kvStore: Record<string, string> = {};
    const sender = "user@gmail.com";
    const today = new Date().toISOString().split("T")[0];
    kvStore[`email_ratelimit:${sender}:${today}`] = "5";

    const mockKV = {
      get: vi.fn(async (k: string) => kvStore[k] ?? null),
      put: vi.fn(async (k: string, v: string) => {
        kvStore[k] = v;
      }),
    };
    const env = { DEALS_SOURCES: mockKV } as unknown as Env;

    const result = await validateSecurity(makeEmail({ from: sender }), env);
    expect(result.valid).toBe(true);
  });
});

describe("isWhitelisted", () => {
  it("should whitelist gmail.com", () => {
    expect(isWhitelisted("user@gmail.com")).toBe(true);
  });

  it("should whitelist outlook.com", () => {
    expect(isWhitelisted("user@outlook.com")).toBe(true);
  });

  it("should whitelist yahoo.com", () => {
    expect(isWhitelisted("user@yahoo.com")).toBe(true);
  });

  it("should whitelist icloud.com", () => {
    expect(isWhitelisted("user@icloud.com")).toBe(true);
  });

  it("should whitelist protonmail.com", () => {
    expect(isWhitelisted("user@protonmail.com")).toBe(true);
  });

  it("should not whitelist unknown domain", () => {
    expect(isWhitelisted("user@evildomain.com")).toBe(false);
  });

  it("should return false for invalid email", () => {
    expect(isWhitelisted("not-an-email")).toBe(false);
  });

  it("should handle case-insensitive domain", () => {
    expect(isWhitelisted("user@GMAIL.COM")).toBe(true);
  });
});

describe("isBlacklisted", () => {
  it("should return not blacklisted for clean sender", async () => {
    const result = await isBlacklisted("user@gmail.com", makeMockEnv());
    expect(result.blacklisted).toBe(false);
  });

  it("should detect blacklisted sender", async () => {
    const kvStore: Record<string, string> = {};
    kvStore["email_blacklist:spammer@evil.com"] = "Reported for spam";
    const mockKV = {
      get: vi.fn(async (k: string) => kvStore[k] ?? null),
      put: vi.fn(),
    };
    const env = { DEALS_SOURCES: mockKV } as unknown as Env;
    const result = await isBlacklisted("spammer@evil.com", env);
    expect(result.blacklisted).toBe(true);
    expect(result.reason).toBe("Reported for spam");
  });

  it("should detect blacklisted domain", async () => {
    const kvStore: Record<string, string> = {};
    kvStore["email_blacklist_domain:evil.com"] = "Known spam domain";
    const mockKV = {
      get: vi.fn(async (k: string) => kvStore[k] ?? null),
      put: vi.fn(),
    };
    const env = { DEALS_SOURCES: mockKV } as unknown as Env;
    const result = await isBlacklisted("user@evil.com", env);
    expect(result.blacklisted).toBe(true);
    expect(result.reason).toContain("Domain blacklisted");
  });

  it("should handle case-insensitive email lookup", async () => {
    const kvStore: Record<string, string> = {};
    kvStore["email_blacklist:spammer@evil.com"] = "Banned";
    const mockKV = {
      get: vi.fn(async (k: string) => kvStore[k] ?? null),
      put: vi.fn(),
    };
    const env = { DEALS_SOURCES: mockKV } as unknown as Env;
    const result = await isBlacklisted("SPAMMER@EVIL.COM", env);
    expect(result.blacklisted).toBe(true);
  });
});
