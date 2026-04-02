/**
 * Admin/Utility Commands
 *
 * System commands: stats, help, start.
 */

import { CommandHandler, CommandContext, Permission } from "./types";
import { getErrorMessage, formatDate } from "./utils";
import {
  addCommand,
  searchCommand,
  getCommand,
  deactivateCommand,
  reactivateCommand,
} from "./referral";
import { researchCommand } from "./research";

// ============================================================================
// Permission Helper (local copy to avoid circular dependency)
// ============================================================================

function hasPermission(ctx: CommandContext, required: Permission[]): boolean {
  if (ctx.isAdmin) return true;
  return required.some((perm) => ctx.permissions.includes(perm));
}

// Build the command list for help display
const allCommands = [
  addCommand,
  searchCommand,
  getCommand,
  deactivateCommand,
  reactivateCommand,
  researchCommand,
];

export const statsCommand: CommandHandler = {
  name: "stats",
  description: "View system statistics",
  usage: "/stats",
  aliases: ["status", "info", "overview"],
  permissions: ["public", "verified", "moderator", "admin"],
  platforms: ["telegram", "discord"],
  execute: async (_ctx, _args, api) => {
    try {
      const response = await api.health();

      const statusEmoji =
        response.status === "healthy"
          ? "✅"
          : response.status === "degraded"
            ? "⚠️"
            : "🔴";

      return {
        success: true,
        message:
          `📊 **DealRelay System Statistics**\n\n` +
          `${statusEmoji} **Status**: ${response.status.toUpperCase()}\n` +
          `📦 **Version**: ${response.version}\n` +
          `⏱️ **Timestamp**: ${formatDate(response.timestamp)}\n\n` +
          `**Health Checks**:\n` +
          `${response.checks.kv_connection ? "✅" : "❌"} KV Connection\n` +
          `${response.checks.last_run_success ? "✅" : "❌"} Last Run Success\n` +
          `${response.checks.snapshot_valid ? "✅" : "❌"} Snapshot Valid\n\n` +
          (response.last_run
            ? `**Last Run**:\n` +
              `🆔 ${response.last_run.run_id}\n` +
              `📅 ${formatDate(response.last_run.timestamp)}\n` +
              `📊 ${response.last_run.deals_count} deals`
            : ""),
      };
    } catch (error) {
      return {
        success: false,
        message: getErrorMessage(error),
      };
    }
  },
};

// Add statsCommand to the list after declaration
allCommands.push(statsCommand);

export const helpCommand: CommandHandler = {
  name: "help",
  description: "Show help information for commands",
  usage: "/help [command]",
  aliases: ["commands", "?"],
  permissions: ["public", "verified", "moderator", "admin"],
  platforms: ["telegram", "discord"],
  execute: async (ctx: CommandContext, args, _api) => {
    if (args.length === 0) {
      // Show general help
      const commandList = allCommands
        .filter((cmd) => cmd.platforms.includes(ctx.platform))
        .filter((cmd) => hasPermission(ctx, cmd.permissions))
        .map((cmd) => `• \`/${cmd.name}\` - ${cmd.description}`)
        .join("\n");

      return {
        success: true,
        message:
          `👋 **Welcome to DealRelay Bot!**\n\n` +
          `I help you manage referral codes. Here's what I can do:\n\n` +
          commandList +
          `\n\nUse \`/help <command>\` for detailed usage.\n\n` +
          `🔗 **API URL**: \`${process.env.DEAL_API_URL || "Not configured"}\``,
      };
    }

    // Show specific command help
    const commandName = args[0].toLowerCase();
    const command = allCommands.find(
      (c) => c.name === commandName || c.aliases?.includes(commandName),
    );

    if (!command) {
      return {
        success: false,
        message: `❌ Command \`${commandName}\` not found. Use \`/help\` to see all commands.`,
      };
    }

    if (!hasPermission(ctx, command.permissions)) {
      return {
        success: false,
        message: `🔒 You don't have permission to use \`/${command.name}\`.`,
      };
    }

    return {
      success: true,
      message:
        `📖 **Help: /${command.name}**\n\n` +
        `${command.description}\n\n` +
        `**Usage**: \`${command.usage}\`\n` +
        (command.aliases?.length
          ? `**Aliases**: ${command.aliases.map((a) => `\`/${a}\``).join(", ")}\n`
          : "") +
        `**Permissions**: ${command.permissions.join(", ")}`,
    };
  },
};

// Add helpCommand to the list after declaration
allCommands.push(helpCommand);

export const startCommand: CommandHandler = {
  name: "start",
  description: "Initialize the bot and show welcome message",
  usage: "/start",
  aliases: [],
  permissions: ["public", "verified", "moderator", "admin"],
  platforms: ["telegram", "discord"],
  execute: async (ctx: CommandContext, _args, _api) => {
    const commandList = allCommands
      .filter((cmd) => cmd.platforms.includes(ctx.platform))
      .filter((cmd) => hasPermission(ctx, cmd.permissions))
      .slice(0, 6)
      .map((cmd) => `• \`/${cmd.name}\``)
      .join("\n");

    return {
      success: true,
      message:
        `👋 **Welcome to DealRelay Bot!**\n\n` +
        `I help you manage referral codes for various services.\n\n` +
        `**Quick Start**:\n` +
        `• \`/add <url>\` - Add a referral code\n` +
        `• \`/search <domain>\` - Find codes for a domain\n` +
        `• \`/research <domain>\` - Research codes automatically\n\n` +
        `**Available Commands**:\n${commandList}\n\n` +
        `Your User ID: \`${ctx.userId}\`\n\n` +
        `Use \`/help\` for all commands or \`/help <command>\` for details.`,
    };
  },
};

// Add startCommand to the list after declaration
allCommands.push(startCommand);
