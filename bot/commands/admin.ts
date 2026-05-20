/**
 * Admin and Utility Commands
 *
 * Commands for system administration, help, and stats.
 */

import { CommandHandler } from "./types";
import { getErrorMessage, formatDate } from "./utils";
import { commands as allCommands } from "./index";

export const startCommand: CommandHandler = {
  name: "start",
  description: "Start the bot and get a welcome message",
  usage: "/start",
  permissions: ["public", "verified", "moderator", "admin"],
  platforms: ["telegram", "discord"],
  execute: async (ctx) => {
    return {
      success: true,
      message:
        "👋 **Welcome to the DealRelay Bot!**\n\n" +
        "I help you find and share referral codes for various services.\n\n" +
        "🔍 **Quick Start**:\n" +
        "• Use `/search <domain>` to find codes (e.g., `/search uber.com`)\n" +
        "• Use `/add <url>` to share your own code\n" +
        "• Use `/research <domain>` to let AI find codes for you\n\n" +
        "Type `/help` to see all available commands.",
    };
  },
};

export const statsCommand: CommandHandler = {
  name: "stats",
  description: "View system statistics",
  usage: "/stats",
  aliases: ["status"],
  permissions: ["verified", "moderator", "admin"],
  platforms: ["telegram", "discord"],
  execute: async (ctx, args, api) => {
    try {
      const health = await api.health();
      const lastRun = health.last_run;

      let lastRunText = "None";
      if (lastRun) {
        lastRunText =
          `ID: \`${lastRun.run_id}\`\n` +
          `Time: ${formatDate(lastRun.timestamp)}\n` +
          `Deals: ${lastRun.deals_count}`;
      }

      return {
        success: true,
        message:
          "📊 **System Statistics**\n\n" +
          `✅ **Status**: ${health.status.toUpperCase()}\n` +
          `🏷️ **Version**: ${health.version}\n` +
          `⏰ **Time**: ${formatDate(health.timestamp)}\n\n` +
          "🏗️ **Last Pipeline Run**:\n" +
          lastRunText +
          "\n\n" +
          "💾 **KV Connections**:\n" +
          (health.checks.kv_connection ? "✅ Connected" : "❌ Disconnected"),
      };
    } catch (error) {
      return {
        success: false,
        message: getErrorMessage(error),
      };
    }
  },
};

export const helpCommand: CommandHandler = {
  name: "help",
  description: "Show available commands and usage info",
  usage: "/help [command]",
  aliases: ["?"],
  permissions: ["public", "verified", "moderator", "admin"],
  platforms: ["telegram", "discord"],
  execute: async (ctx, args) => {
    if (args.length === 0) {
      // Show general help
      const commandList = allCommands
        .filter((c) => c.platforms.includes(ctx.platform))
        .map((c) => `• \`/${c.name}\` - ${c.description}`)
        .join("\n");

      return {
        success: true,
        message:
          "📖 **DealRelay Bot Help**\n\n" +
          "I help you manage referral codes. Here's what I can do:\n\n" +
          commandList +
          "\n\nUse `/help <command>` for detailed usage.\n\n" +
          `🔗 **API URL**: \`${process.env["DEAL_API_URL"] || "Not configured"}\``,
      };
    }

    // Show specific command help
    const rawCommandName = args[0] || "";
    const commandName = rawCommandName.toLowerCase();
    const command = allCommands.find(
      (c) =>
        c.name === commandName ||
        (c.aliases && c.aliases.includes(commandName)),
    );

    if (!command) {
      return {
        success: false,
        message: `❌ Unknown command: \`${commandName}\`. Type \`/help\` to see all commands.`,
      };
    }

    const aliases =
      command.aliases && command.aliases.length > 0
        ? `\n**Aliases**: ${command.aliases.map((a) => `/${a}`).join(", ")}`
        : "";

    return {
      success: true,
      message:
        `📘 **Command: /${command.name}**\n\n` +
        command.description +
        "\n\n" +
        `**Usage**: \`${command.usage || `/${command.name}`}\`${aliases}\n` +
        `**Permissions**: ${command.permissions.join(", ")}`,
    };
  },
};
