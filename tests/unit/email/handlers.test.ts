/**
 * Email Handler Tests (T-2)
 *
 * Covers worker/email/handlers orchestration: processEmail security gate,
 * ADD/DEACTIVATE/SEARCH/DIGEST/HELP/FORWARDED dispatch, duplicate and
 * low-confidence branches, the exception path, and emailWorkerHandler
 * header/recipient mapping. validateSecurity and referral-storage are
 * mocked; parseCommand, templates, extraction, and crypto stay real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env, ReferralInput } from "../../../worker/types";
import type { ParsedEmail } from "../../../worker/email/types";

vi.mock("../../../worker/email/security", () => ({
  validateSecurity: vi.fn(),
}));

vi.mock("../../../worker/lib/referral-storage", () => ({
  storeReferralInput: vi.fn(),
  getReferralByCode: vi.fn(),
  searchReferrals: vi.fn(),
  deactivateReferral: vi.fn(),
}));

vi.mock("../../../worker/lib/global-logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

function makeEnv(): Env {
  return {
    DEALS_SOURCES: {
      get: vi.fn(),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
      list: vi.fn(),
    },
    ENVIRONMENT: "test",
  } as unknown as Env;
}

function makeEmail(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    from: "user@x.com",
    to: ["inbox@x.com"],
    subject: "hello",
    text: "",
    ...overrides,
  };
}

function makeReferral(overrides: Partial<ReferralInput> = {}): ReferralInput {
  return {
    id: "ref-1",
    code: "WISE123",
    url: "https://wise.com/invite/abc",
    domain: "wise",
    status: "active",
    ...overrides,
  } as unknown as ReferralInput;
}

async function loadMocks(): Promise<{
  validateSecurity: ReturnType<typeof vi.fn>;
  storeReferralInput: ReturnType<typeof vi.fn>;
  getReferralByCode: ReturnType<typeof vi.fn>;
  searchReferrals: ReturnType<typeof vi.fn>;
  deactivateReferral: ReturnType<typeof vi.fn>;
}> {
  const { validateSecurity } = await import("../../../worker/email/security");
  const storage = await import("../../../worker/lib/referral-storage");
  return {
    validateSecurity: vi.mocked(validateSecurity),
    storeReferralInput: vi.mocked(storage.storeReferralInput),
    getReferralByCode: vi.mocked(storage.getReferralByCode),
    searchReferrals: vi.mocked(storage.searchReferrals),
    deactivateReferral: vi.mocked(storage.deactivateReferral),
  };
}

describe("processEmail dispatch", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mocks = await loadMocks();
    mocks.validateSecurity.mockResolvedValue({ valid: true });
    mocks.getReferralByCode.mockResolvedValue(null);
    mocks.searchReferrals.mockResolvedValue({ referrals: [], total: 0 });
    mocks.deactivateReferral.mockResolvedValue(null);
    mocks.storeReferralInput.mockImplementation(
      async (_env: Env, referral: ReferralInput) => referral,
    );
  });

  it("rejects when the security check fails", async () => {
    const { processEmail } =
      await import("../../../worker/email/handlers/incoming");
    const mocks = await loadMocks();
    mocks.validateSecurity.mockResolvedValue({
      valid: false,
      reason: "spam detected",
    });

    const result = await processEmail(
      makeEmail({ to: ["add@x.com"], subject: "add" }),
      makeEnv(),
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("spam detected");
    expect(result.confirmationSent).toBe(false);
    expect(mocks.storeReferralInput).not.toHaveBeenCalled();
  });

  it("adds a referral through the ADD command", async () => {
    const { processEmail } =
      await import("../../../worker/email/handlers/incoming");
    const mocks = await loadMocks();
    const env = makeEnv();

    const result = await processEmail(
      makeEmail({
        to: ["add@x.com"],
        subject: "add",
        text: "service: Wise\ncode: WISE123\nreward: $20 bonus",
      }),
      env,
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe("Referral added successfully");
    expect(typeof result.referralId).toBe("string");
    expect(result.confirmationSent).toBe(true);
    expect(mocks.storeReferralInput).toHaveBeenCalledOnce();
    const stored = mocks.storeReferralInput.mock.calls[0]?.[1];
    expect(stored?.status).toBe("quarantined");
    expect(stored?.submitted_by).toBe("user@x.com");
    expect(stored?.code).toBe("wise123");
    expect(env.DEALS_SOURCES.put).toHaveBeenCalled();
  });

  it("replies with help when ADD has no service", async () => {
    const { processEmail } =
      await import("../../../worker/email/handlers/incoming");
    const mocks = await loadMocks();

    const result = await processEmail(
      makeEmail({ to: ["add@x.com"], subject: "add:", text: "" }),
      makeEnv(),
    );

    expect(result.success).toBe(false);
    expect(result.message).toBe("Missing required field: service");
    expect(result.confirmationSent).toBe(true);
    expect(mocks.storeReferralInput).not.toHaveBeenCalled();
  });

  it("replies with help when ADD has neither code nor URL", async () => {
    const { processEmail } =
      await import("../../../worker/email/handlers/incoming");

    const result = await processEmail(
      makeEmail({
        to: ["add@x.com"],
        subject: "add",
        text: "service: Wise",
      }),
      makeEnv(),
    );

    expect(result.success).toBe(false);
    expect(result.message).toBe("Missing required field: code or referral URL");
    expect(result.confirmationSent).toBe(true);
  });

  it("rejects duplicate codes on ADD without storing", async () => {
    const { processEmail } =
      await import("../../../worker/email/handlers/incoming");
    const mocks = await loadMocks();
    mocks.getReferralByCode.mockResolvedValue(makeReferral());

    const result = await processEmail(
      makeEmail({
        to: ["add@x.com"],
        subject: "add",
        text: "service: Wise\ncode: WISE123",
      }),
      makeEnv(),
    );

    expect(result.success).toBe(false);
    expect(result.message).toBe("Referral code already exists");
    expect(result.confirmationSent).toBe(false);
    expect(mocks.storeReferralInput).not.toHaveBeenCalled();
  });

  it("requires a code for DEACTIVATE", async () => {
    const { processEmail } =
      await import("../../../worker/email/handlers/incoming");

    const result = await processEmail(
      makeEmail({ to: ["deactivate@x.com"], subject: "deactivate" }),
      makeEnv(),
    );

    expect(result.success).toBe(false);
    expect(result.message).toBe("Missing required field: code");
  });

  it("reports unknown codes on DEACTIVATE", async () => {
    const { processEmail } =
      await import("../../../worker/email/handlers/incoming");

    const result = await processEmail(
      makeEmail({
        to: ["deactivate@x.com"],
        subject: "deactivate wise NOPE123",
      }),
      makeEnv(),
    );

    expect(result.success).toBe(false);
    expect(result.message).toBe("Referral not found");
  });

  it("deactivates known codes and confirms", async () => {
    const { processEmail } =
      await import("../../../worker/email/handlers/incoming");
    const mocks = await loadMocks();
    mocks.getReferralByCode.mockResolvedValue(makeReferral());
    const env = makeEnv();

    const result = await processEmail(
      makeEmail({
        to: ["deactivate@x.com"],
        subject: "deactivate wise WISE123",
      }),
      env,
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe("Referral deactivated successfully");
    expect(result.confirmationSent).toBe(true);
    expect(mocks.deactivateReferral).toHaveBeenCalledWith(
      env,
      "wise123",
      "user_request",
      undefined,
      undefined,
    );
  });

  it("requires a query for SEARCH", async () => {
    const { processEmail } =
      await import("../../../worker/email/handlers/incoming");

    const result = await processEmail(
      makeEmail({ to: ["search@x.com"], subject: "" }),
      makeEnv(),
    );

    expect(result.success).toBe(false);
    expect(result.message).toBe("Missing search query");
  });

  it("returns formatted results for SEARCH", async () => {
    const { processEmail } =
      await import("../../../worker/email/handlers/incoming");
    const mocks = await loadMocks();
    mocks.searchReferrals.mockResolvedValue({
      referrals: [
        makeReferral({ id: "r1", code: "AAA" }),
        makeReferral({ id: "r2", code: "BBB" }),
      ],
      total: 2,
    });

    const result = await processEmail(
      makeEmail({ to: ["search@x.com"], subject: "wise" }),
      makeEnv(),
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe("Found 2 referral(s)");
    expect(result.confirmationSent).toBe(true);
  });

  it("sends a monthly DIGEST with reward lines", async () => {
    const { processEmail } =
      await import("../../../worker/email/handlers/incoming");
    const mocks = await loadMocks();
    mocks.searchReferrals.mockResolvedValue({
      referrals: [makeReferral({ metadata: { reward_value: "$20" } })],
      total: 1,
    });

    const result = await processEmail(
      makeEmail({ to: ["digest@x.com"], subject: "monthly" }),
      makeEnv(),
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe("Digest sent with 1 referrals");
    expect(result.confirmationSent).toBe(true);
  });

  it("sends help for HELP", async () => {
    const { processEmail } =
      await import("../../../worker/email/handlers/incoming");
    const env = makeEnv();

    const result = await processEmail(
      makeEmail({ to: ["help@x.com"], subject: "anything" }),
      env,
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe("Help email sent");
    expect(result.confirmationSent).toBe(true);
    expect(env.DEALS_SOURCES.put).toHaveBeenCalled();
  });

  it("requests manual input when extraction confidence is zero", async () => {
    const { processEmail } =
      await import("../../../worker/email/handlers/incoming");
    const mocks = await loadMocks();

    const result = await processEmail(
      makeEmail({ subject: "hello there", text: "just saying hi" }),
      makeEnv(),
    );

    expect(result.success).toBe(false);
    expect(result.message).toBe(
      "Could not automatically extract referral code",
    );
    expect(result.confirmationSent).toBe(true);
    expect(mocks.storeReferralInput).not.toHaveBeenCalled();
  });

  it("rejects duplicate codes on FORWARDED with confirmation", async () => {
    const { processEmail } =
      await import("../../../worker/email/handlers/incoming");
    const mocks = await loadMocks();
    mocks.getReferralByCode.mockResolvedValue(makeReferral({ id: "ref-9" }));

    const result = await processEmail(
      makeEmail({
        subject: "Fwd: invite",
        text: "get started here https://example.com/join?ref=SAVE20NOW today",
      }),
      makeEnv(),
    );

    expect(result.success).toBe(false);
    expect(result.message).toBe("Referral code already exists");
    expect(result.confirmationSent).toBe(true);
    expect(mocks.storeReferralInput).not.toHaveBeenCalled();
  });

  it("stores auto-extracted referrals on FORWARDED", async () => {
    const { processEmail } =
      await import("../../../worker/email/handlers/incoming");
    const mocks = await loadMocks();

    const result = await processEmail(
      makeEmail({
        subject: "Fwd: invite",
        text: "get started here https://example.com/join?ref=SAVE20NOW today",
      }),
      makeEnv(),
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe("Referral extracted and stored successfully");
    expect(typeof result.referralId).toBe("string");
    expect(result.extracted?.confidence).toBeGreaterThan(0);
    expect(result.confirmationSent).toBe(true);
    expect(mocks.storeReferralInput).toHaveBeenCalledOnce();
    const stored = mocks.storeReferralInput.mock.calls[0]?.[1];
    expect(stored?.code).toBe("SAVE20NOW");
    expect(stored?.domain).toBe("example.com");
  });

  it("returns an internal error when validation throws", async () => {
    const { processEmail } =
      await import("../../../worker/email/handlers/incoming");
    const mocks = await loadMocks();
    mocks.validateSecurity.mockRejectedValueOnce(new Error("db boom"));

    const result = await processEmail(makeEmail(), makeEnv());

    expect(result.success).toBe(false);
    expect(result.message).toBe("Internal processing error");
    expect(result.confirmationSent).toBe(false);
    expect(result.error).toBe("db boom");
  });
});

describe("emailWorkerHandler mapping", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mocks = await loadMocks();
    mocks.validateSecurity.mockResolvedValue({ valid: true });
    mocks.getReferralByCode.mockResolvedValue(null);
    mocks.searchReferrals.mockResolvedValue({ referrals: [], total: 0 });
    mocks.deactivateReferral.mockResolvedValue(null);
    mocks.storeReferralInput.mockImplementation(
      async (_env: Env, referral: ReferralInput) => referral,
    );
  });

  it("maps headers and splits/trims recipients", async () => {
    const { emailWorkerHandler } =
      await import("../../../worker/email/handlers/incoming");
    const mocks = await loadMocks();
    let captured: ParsedEmail | undefined;
    mocks.validateSecurity.mockImplementationOnce(
      async (email: ParsedEmail) => {
        captured = email;
        return { valid: false, reason: "stop" };
      },
    );

    await emailWorkerHandler(
      {
        from: "user@x.com",
        to: "a@x.com,  b@y.com ",
        subject: "hello",
        headers: new Headers({ "x-dkim-valid": "true" }),
        text: "hi",
      },
      makeEnv(),
    );

    expect(captured?.to).toEqual(["a@x.com", "b@y.com"]);
    expect(captured?.dkimValid).toBe(true);
    expect(captured?.spfValid).toBe(false);
  });
});
