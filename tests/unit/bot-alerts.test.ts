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
  } as any;

  it("should be discoverable via findCommand", () => {
    const cmd = findCommand("alert", "telegram");
    expect(cmd).toBeDefined();
    expect(cmd?.name).toBe("alert");
  });

  it("should execute list subcommand successfully", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          subscriptions: [
            {
              id: "sub_999",
              query: "developer credits",
              channel: "telegram",
              frequency: "instant",
              threshold: 0.7,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const res = await alertCommand.execute(mockCtx, ["list"], mockApi);
    expect(res.message).toContain("Your Deal Alerts");
    expect(res.message).toContain("sub_999");
    expect(res.message).toContain("developer credits");

    vi.unstubAllGlobals();
  });

  it("should execute delete subcommand successfully", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, deleted: "sub_999" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const res = await alertCommand.execute(
      mockCtx,
      ["delete", "sub_999"],
      mockApi,
    );
    expect(res.message).toContain("deleted successfully");

    vi.unstubAllGlobals();
  });
});
