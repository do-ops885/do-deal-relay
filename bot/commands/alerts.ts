import type { CommandHandler, CommandContext, CommandResult } from "./types";
import { getErrorMessage } from "./utils";

export const alertCommand: CommandHandler = {
  name: "alert",
  aliases: ["alerts"],
  description: "Manage deal alerts and saved queries",
  usage: "/alert [list | delete <id>]",
  platforms: ["telegram", "discord"],
  requiredPermissions: ["read"],

  async execute(ctx: CommandContext, args: string[]): Promise<CommandResult> {
    const subAction = (args[0] || "list").toLowerCase();

    if (subAction === "list") {
      try {
        const url = `${ctx.env.API_BASE_URL || "http://localhost:8787"}/api/nlq/alerts`;
        const res = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${ctx.env.JWT_SECRET || ""}`,
            "X-User-Id": ctx.userId,
          },
        });

        if (!res.ok) {
          return { text: "❌ Failed to retrieve deal alerts." };
        }

        const data = (await res.json()) as any;
        const subs = data.subscriptions || [];

        if (subs.length === 0) {
          return { text: "ℹ️ You have no active deal alerts configured." };
        }

        const alertLines = subs
          .map(
            (s: any) =>
              `• **ID**: \`${s.id}\` | Query: _"${s.query || "Saved Query"}"_\n  Channel: \`${s.channel}\` | Freq: \`${s.frequency}\` | Threshold: ${s.threshold}`,
          )
          .join("\n\n");

        return {
          text: `🔔 **Your Deal Alerts** (${subs.length}):\n\n${alertLines}`,
        };
      } catch (e) {
        return { text: `❌ Error: ${getErrorMessage(e)}` };
      }
    }

    if (subAction === "delete" || subAction === "remove") {
      const id = args[1];
      if (!id) {
        return { text: "❌ Please specify the alert subscription ID to delete.\nUsage: `/alert delete <id>`" };
      }

      try {
        const url = `${ctx.env.API_BASE_URL || "http://localhost:8787"}/api/nlq/alerts/${id}`;
        const res = await fetch(url, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${ctx.env.JWT_SECRET || ""}`,
            "X-User-Id": ctx.userId,
          },
        });

        if (!res.ok) {
          return { text: `❌ Failed to delete alert \`${id}\`.` };
        }

        return { text: `✅ Alert subscription \`${id}\` deleted successfully.` };
      } catch (e) {
        return { text: `❌ Error: ${getErrorMessage(e)}` };
      }
    }

    return {
      text: "ℹ️ Unknown alert command.\nUsage:\n• `/alert list` - List your alert subscriptions\n• `/alert delete <id>` - Remove an alert subscription",
    };
  },
};
