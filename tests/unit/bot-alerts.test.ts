import { describe, it, expect, vi } from "vitest";
import { alertCommand } from "../../bot/commands/alerts";
import { findCommand } from "../../bot/commands/index";
import type { CommandContext } from "../../bot/commands/types";

describe("Bot Alert Command Unit Tests", () => {
  const mockCtx: CommandContext = {
    userId: "user_test_456",
    platform: "telegram",
    isAdmin: false,
    permissions: ["verified"],
  };

  const mockApi = {
    createReferral: vi.fn(),
    searchReferrals: vi.fn(),
    getReferral: vi.fn(),
    deactivateReferral: vi.fn(),
    reactivateReferral: vi.fn(),
    getAlertSubscriptions: vi.fn(),
    deleteAlertSubscription: vi.fn(),
  } as any;

  it("should be discoverable via findCommand", () => {
    const cmd = findCommand("alert", "telegram");
    expect(cmd).toBeDefined();
    expect(cmd?.name).toBe("alert");
  });

  it("should execute list subcommand successfully", async () => {
    mockApi.getAlertSubscriptions.mockResolvedValue({
      success: true,
      total: 1,
      count: 1,
      subscriptions: [
        {
          id: "sub_999",
          user_id: "user_test_456",
          saved_query_id: "q_1",
          query: "developer credits",
          channel: "telegram",
          destination: "123",
          frequency: "instant",
          threshold: 0.7,
          active: 1,
          created_at: 1000,
          updated_at: 1000,
        },
      ],
    });

    const res = await alertCommand.execute(mockCtx, ["list"], mockApi);
    expect(res.message).toContain("Your Deal Alerts");
    expect(res.message).toContain("sub_999");
    expect(res.message).toContain("developer credits");
  });

  it("should execute delete subcommand successfully", async () => {
    mockApi.deleteAlertSubscription.mockResolvedValue({
      success: true,
      deleted: "sub_999",
    });

    const res = await alertCommand.execute(
      mockCtx,
      ["delete", "sub_999"],
      mockApi,
    );
    expect(res.message).toContain("deleted successfully");
  });
});
