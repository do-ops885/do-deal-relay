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
    _api: DealRelayAPI,
  ): Promise<CommandResult> {
    const subAction = (args[0] || "list").toLowerCase();

    if (subAction === "list") {
      try {
        const url = "/api/nlq/alerts";
        // Call API endpoint
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "X-User-Id": ctx.userId,
          },
        });

        if (!res.ok) {
          return {
            success: false,
            message: "❌ Failed to retrieve deal alerts.",
          };
        }

        const data = (await res.json()) as any;
        const subs = data.subscriptions || [];

        if (subs.length === 0) {
          return {
            success: true,
            message: "ℹ️ You have no active deal alerts configured.",
          };
        }

        const alertLines = subs
          .map(
            (s: any) =>
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
        const url = `/api/nlq/alerts/${id}`;
        const res = await fetch(url, {
          method: "DELETE",
          headers: {
            "X-User-Id": ctx.userId,
          },
        });

        if (!res.ok) {
          return {
            success: false,
            message: `❌ Failed to delete alert \`${id}\`.`,
          };
        }

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
