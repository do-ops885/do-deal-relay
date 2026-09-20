import type { CommandHandler, CommandContext, CommandResult } from "./types";
import { getErrorMessage } from "./utils";
import type { DealRelayAPI } from "../api-client";

export const alertCommand: CommandHandler = {
  name: "alert",
  aliases: ["alerts"],
  description: "Manage deal alerts and saved queries",
  usage: "/alert [list | delete <id>]",
  platforms: ["telegram", "discord"],
  permissions: ["public", "verified", "moderator", "admin"],

  async execute(
    ctx: CommandContext,
    args: string[],
    api: DealRelayAPI,
  ): Promise<CommandResult> {
    const subAction = (args[0] || "list").toLowerCase();

    if (subAction === "list") {
      try {
        const res = await api.getAlertSubscriptions(ctx.userId);

        const subs = res.subscriptions || [];

        if (subs.length === 0) {
          return {
            success: true,
            message: "ℹ️ You have no active deal alerts configured.",
          };
        }

        const alertLines = subs
          .map(
            (s) =>
              `• **ID**: \`${s.id}\` | Query: _"${s.query || "Saved Query"}"_\n  Channel: \`${s.channel}\` | Freq: \`${s.frequency}\` | Threshold: ${s.threshold}`,
          )
          .join("\n\n");

        return {
          success: true,
          message: `🔔 **Your Deal Alerts** (${subs.length}):\n\n${alertLines}`,
        };
      } catch (e) {
        return {
          success: false,
          message: `❌ Error: ${getErrorMessage(e)}`,
        };
      }
    }

    if (subAction === "delete" || subAction === "remove") {
      const id = args[1];
      if (!id) {
        return {
          success: false,
          message:
            "❌ Please specify the alert subscription ID to delete.\nUsage: `/alert delete <id>`",
        };
      }

      try {
        await api.deleteAlertSubscription(ctx.userId, id);

        return {
          success: true,
          message: `✅ Alert subscription \`${id}\` deleted successfully.`,
        };
      } catch (e) {
        return {
          success: false,
          message: `❌ Error: ${getErrorMessage(e)}`,
        };
      }
    }

    return {
      success: false,
      message:
        "ℹ️ Unknown alert command.\nUsage:\n• `/alert list` - List your alert subscriptions\n• `/alert delete <id>` - Remove an alert subscription",
    };
  },
};
