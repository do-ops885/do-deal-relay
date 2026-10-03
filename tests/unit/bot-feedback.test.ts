import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  workedCommand,
  failedCommand,
  expiredCommand,
} from "../../bot/commands/feedback";
import { findCommand, commands } from "../../bot/commands/index";
import type { CommandContext } from "../../bot/commands/types";
import type { DealRelayAPI } from "../../bot/api-client";

const mockCtx: CommandContext = {
  userId: "user_test_789",
  platform: "telegram",
  isAdmin: false,
  permissions: ["verified"],
};

function makeApi() {
  return {
    reportDealFeedback: vi.fn(),
  } as unknown as DealRelayAPI & {
    reportDealFeedback: ReturnType<typeof vi.fn>;
  };
}

const statsFixture = {
  code: "AWS500",
  outcome: "success",
  inserted: true,
  feedback: {
    total: 4,
    success: 3,
    expired: 1,
    invalid: 0,
    successRatio: 0.75,
  },
};

describe("Bot Feedback Commands (ADR-033 slice 2)", () => {
  let api: ReturnType<typeof makeApi>;

  beforeEach(() => {
    api = makeApi();
    vi.clearAllMocks();
  });

  it("registers worked, failed, and expired in the command registry", () => {
    expect(findCommand("worked", "telegram")).toBeDefined();
    expect(findCommand("failed", "telegram")).toBeDefined();
    expect(findCommand("expired", "discord")).toBeDefined();
    const names = commands.map((c) => c.name);
    expect(names).toContain("worked");
    expect(names).toContain("failed");
    expect(names).toContain("expired");
  });

  it("maps /worked to the success outcome and renders stats", async () => {
    api.reportDealFeedback.mockResolvedValue(statsFixture);
    const res = await workedCommand.execute(mockCtx, ["AWS500"], api);
    expect(api.reportDealFeedback).toHaveBeenCalledWith("AWS500", "success");
    expect(res.success).toBe(true);
    expect(res.message).toContain("**worked**");
    expect(res.message).toContain("4 report(s)");
    expect(res.message).toContain("75% success rate");
  });

  it("maps /failed to the invalid outcome", async () => {
    api.reportDealFeedback.mockResolvedValue({
      ...statsFixture,
      outcome: "invalid",
    });
    await failedCommand.execute(mockCtx, ["AWS500"], api);
    expect(api.reportDealFeedback).toHaveBeenCalledWith("AWS500", "invalid");
  });

  it("maps /expired to the expired outcome", async () => {
    api.reportDealFeedback.mockResolvedValue({
      ...statsFixture,
      outcome: "expired",
    });
    await expiredCommand.execute(mockCtx, ["AWS500"], api);
    expect(api.reportDealFeedback).toHaveBeenCalledWith("AWS500", "expired");
  });

  it("requires a code argument", async () => {
    const res = await workedCommand.execute(mockCtx, [], api);
    expect(res.success).toBe(false);
    expect(res.message).toContain("Please specify the deal code");
    expect(res.message).toContain("/worked [code]");
    expect(api.reportDealFeedback).not.toHaveBeenCalled();
  });

  it("notes revisions when the report updates an existing one", async () => {
    api.reportDealFeedback.mockResolvedValue({
      ...statsFixture,
      inserted: false,
    });
    const res = await workedCommand.execute(mockCtx, ["AWS500"], api);
    expect(res.success).toBe(true);
    expect(res.message).toContain("revised your previous report");
  });

  it("surfaces API errors without throwing", async () => {
    api.reportDealFeedback.mockRejectedValue(new Error("Deal not found"));
    const res = await workedCommand.execute(mockCtx, ["NOPE"], api);
    expect(res.success).toBe(false);
    expect(res.message).toContain("Deal not found");
  });
});
