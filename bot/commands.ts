import { Context } from "telegraf";
import { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { DealRelayAPI } from "./api-client";

// ============================================================================
// Command Types
// ============================================================================

export interface CommandContext {
  platform: "telegram" | "discord";
  userId: string;
  username?: string;
  isAdmin: boolean;
  permissions: Permission[];
}

export type Permission = "public" | "verified" | "moderator" | "admin";

export interface CommandHandler {
  name: string;
  description: string;
  usage: string;
  aliases?: string[];
  permissions: Permission[];
  platforms: ("telegram" | "discord")[];
  execute: (
    ctx: CommandContext,
    args: string[],
    api: DealRelayAPI,
  ) => Promise<CommandResult>;
}

export interface CommandResult {
  success: boolean;
  message: string;
  data?: unknown;
  buttons?: Button[];
}

export interface Button {
  text: string;
  action: string;
  data?: string;
}

// ============================================================================
// Permission Helper
// ============================================================================

export function hasPermission(
  ctx: CommandContext,
  required: Permission[],
): boolean {
  // Admin has all permissions
  if (ctx.isAdmin) return true;

  // Check if user has any of the required permissions
  return required.some((perm) => ctx.permissions.includes(perm));
}

// ============================================================================
// Command Registry
// ============================================================================

export const commands: CommandHandler[] = [
  // ============================================================================
  // /add - Add Referral Code
  // ============================================================================
  {
    name: "add",
    description: "Add a new referral code to the system",
    usage: "/add <code> <url> [reward]",
    aliases: ["new", "create"],
    permissions: ["verified", "moderator", "admin"],
    platforms: ["telegram", "discord"],
    execute: async (ctx, args, api) => {
      if (args.length < 1) {
        return {
          success: false,
          message:
            "❌ Usage: `/add <url>` or `/add <code> <url>`\n\n" +
            "Examples:\n" +
            "• `/add https://picnic.app/de/freunde-rabatt/DOMI6869`\n" +
            "• `/add DOMI6869 https://picnic.app/de/freunde-rabatt/DOMI6869`",
        };
      }

      let code: string;
      let url: string;

      // Smart parsing: if only one arg, extract code from URL
      if (args.length === 1) {
        url = args[0];
        try {
          const parsedUrl = new URL(url);
          // Extract code from path (e.g., /invite/CODE or /ref/CODE)
          const pathParts = parsedUrl.pathname.split("/");
          code = pathParts[pathParts.length - 1] || parsedUrl.pathname;
        } catch {
          return {
            success: false,
            message: "❌ Invalid URL. Please provide a valid referral URL.",
          };
        }
      } else {
        code = args[0];
        url = args[1];
      }

      // Validate URL
      let domain: string;
      try {
        const parsedUrl = new URL(url);
        domain = parsedUrl.hostname.replace(/^www\./, "");
      } catch {
        return {
          success: false,
          message:
            "❌ Invalid URL. Please provide a valid URL including https://",
        };
      }

      // Extract reward from remaining args (if any)
      const rewardValue = args.length > 2 ? args.slice(2).join(" ") : undefined;

      try {
        const response = await api.createReferral({
          code,
          url, // Complete URL preserved
          domain,
          source: ctx.platform,
          submitted_by: ctx.userId,
          metadata: {
            title: `${domain} Referral`,
            reward_value: rewardValue,
            category: ["general"],
            tags: ["bot-added", ctx.platform],
            notes: `Added by ${ctx.username || ctx.userId} via ${ctx.platform} bot`,
          },
        });

        return {
          success: true,
          message:
            `✅ Referral added successfully!\n\n` +
            `🎯 **Code**: \`${response.referral.code}\`\n` +
            `🔗 **URL**: ${response.referral.url}\n` + // Complete URL shown
            `🌐 **Domain**: ${response.referral.domain}\n` +
            `📊 **Status**: ${response.referral.status}\n` +
            `🆔 **ID**: \`${response.referral.id}\`\n\n` +
            `The code will be validated and activated within a few minutes.`,
        };
      } catch (error) {
        return {
          success: false,
          message: getErrorMessage(error),
        };
      }
    },
  },

  // ============================================================================
  // /search - Search Referrals
  // ============================================================================
  {
    name: "search",
    description: "Search for referral codes by domain",
    usage: "/search <domain>",
    aliases: ["find", "query", "lookup"],
    permissions: ["public", "verified", "moderator", "admin"],
    platforms: ["telegram", "discord"],
    execute: async (ctx, args, api) => {
      if (args.length < 1) {
        return {
          success: false,
          message:
            "❌ Usage: `/search <domain>`\n\nExample: `/search trading212.com`",
        };
      }

      const domain = args[0];
      const status = (args[1] as "active" | "all") || "active";

      try {
        const response = await api.searchReferrals({
          domain,
          status,
          source: "all",
          limit: 10,
        });

        if (response.referrals.length === 0) {
          return {
            success: true,
            message:
              `🔍 No ${status} referrals found for **${domain}**.\n\n` +
              `Try running research: \`/research ${domain}\``,
          };
        }

        const referralList = response.referrals
          .map((ref, i) => {
            const statusIcon =
              ref.status === "active"
                ? "✅"
                : ref.status === "quarantined"
                  ? "⏳"
                  : "🚫";
            const reward = ref.metadata.reward_value
              ? ` - ${ref.metadata.reward_value}`
              : "";
            return `${i + 1}. \`${ref.code}\`${reward}\n   ${statusIcon} ${ref.status}`;
          })
          .join("\n\n");

        return {
          success: true,
          message:
            `🔍 Found ${response.total} referral(s) for **${domain}**:\n\n` +
            referralList +
            `\n\nUse \`/get <code>\` for full details.`,
          buttons: response.referrals.slice(0, 3).map((ref) => ({
            text: `Get ${ref.code}`,
            action: "get",
            data: ref.code,
          })),
        };
      } catch (error) {
        return {
          success: false,
          message: getErrorMessage(error),
        };
      }
    },
  },

  // ============================================================================
  // /get - Get Referral Details
  // ============================================================================
  {
    name: "get",
    description: "Get detailed information about a referral code",
    usage: "/get <code>",
    aliases: ["details", "info", "view"],
    permissions: ["public", "verified", "moderator", "admin"],
    platforms: ["telegram", "discord"],
    execute: async (ctx, args, api) => {
      if (args.length < 1) {
        return {
          success: false,
          message: "❌ Usage: `/get <code>`\n\nExample: `/get GcCOCxbo`",
        };
      }

      const code = args[0];

      try {
        const response = await api.getReferral(code);
        const ref = response.referral;

        const statusIcon =
          ref.status === "active"
            ? "✅ Active"
            : ref.status === "quarantined"
              ? "⏳ Pending Review"
              : ref.status === "expired"
                ? "⌛ Expired"
                : "🚫 Inactive";

        const reward = ref.metadata.reward_value
          ? `🎁 **Reward**: ${ref.metadata.reward_value}${ref.metadata.currency ? ` ${ref.metadata.currency}` : ""}\n`
          : "";

        const deactivated = ref.deactivated_at
          ? `🚫 **Deactivated**: ${formatDate(ref.deactivated_at)}\n` +
            `📋 **Reason**: ${ref.deactivated_reason || "Not specified"}\n`
          : "";

        return {
          success: true,
          message:
            `📋 **Referral Details: \`${ref.code}\`**\n\n` +
            `🎯 **Domain**: ${ref.domain}\n` +
            `🔗 **URL**: ${ref.url}\n` + // Complete URL shown
            `${reward}` +
            `📊 **Status**: ${statusIcon}\n` +
            `🆔 **ID**: \`${ref.id}\`\n` +
            `📅 **Added**: ${formatDate(ref.submitted_at)}\n` +
            `${deactivated}` +
            (ref.metadata.notes ? `📝 **Notes**: ${ref.metadata.notes}\n` : ""),
          buttons:
            ref.status === "active"
              ? [
                  {
                    text: "🚫 Deactivate",
                    action: "deactivate",
                    data: ref.code,
                  },
                ]
              : ref.status === "inactive" || ref.status === "expired"
                ? [
                    {
                      text: "✅ Reactivate",
                      action: "reactivate",
                      data: ref.code,
                    },
                  ]
                : [],
        };
      } catch (error) {
        return {
          success: false,
          message: getErrorMessage(error),
        };
      }
    },
  },

  // ============================================================================
  // /deactivate - Deactivate Referral
  // ============================================================================
  {
    name: "deactivate",
    description: "Deactivate a referral code",
    usage: "/deactivate <code> [reason]",
    aliases: ["disable", "remove", "expire"],
    permissions: ["moderator", "admin"],
    platforms: ["telegram", "discord"],
    execute: async (ctx, args, api) => {
      if (args.length < 1) {
        return {
          success: false,
          message:
            "❌ Usage: `/deactivate <code> [reason]`\n\n" +
            "Reasons: `expired`, `invalid`, `violation`, `replaced`, `user_request`\n\n" +
            "Example: `/deactivate GcCOCxbo expired`",
        };
      }

      const code = args[0];
      const reason =
        (args[1] as
          | "expired"
          | "invalid"
          | "violation"
          | "replaced"
          | "user_request") || "user_request";

      const notes = args.length > 2 ? args.slice(2).join(" ") : undefined;

      try {
        const response = await api.deactivateReferral(code, reason, {
          notes,
        });

        return {
          success: true,
          message:
            `🚫 **Referral Deactivated**\n\n` +
            `🎯 **Code**: \`${response.referral.code}\`\n` +
            `🔗 **URL**: ${response.referral.url}\n` + // Complete URL shown
            `📋 **Reason**: ${reason}\n` +
            `👤 **By**: ${ctx.username || ctx.userId}\n` +
            `📅 **Time**: ${formatDate(new Date().toISOString())}\n\n` +
            `The code has been moved to inactive status.`,
        };
      } catch (error) {
        return {
          success: false,
          message: getErrorMessage(error),
        };
      }
    },
  },

  // ============================================================================
  // /reactivate - Reactivate Referral
  // ============================================================================
  {
    name: "reactivate",
    description: "Reactivate a previously deactivated referral code",
    usage: "/reactivate <code>",
    aliases: ["enable", "restore"],
    permissions: ["moderator", "admin"],
    platforms: ["telegram", "discord"],
    execute: async (ctx, args, api) => {
      if (args.length < 1) {
        return {
          success: false,
          message:
            "❌ Usage: `/reactivate <code>`\n\nExample: `/reactivate GcCOCxbo`",
        };
      }

      const code = args[0];

      try {
        const response = await api.reactivateReferral(code);

        return {
          success: true,
          message:
            `✅ **Referral Reactivated**\n\n` +
            `🎯 **Code**: \`${response.referral.code}\`\n` +
            `🔗 **URL**: ${response.referral.url}\n` + // Complete URL shown
            `📊 **Status**: ${response.referral.status}\n` +
            `👤 **By**: ${ctx.username || ctx.userId}\n` +
            `📅 **Time**: ${formatDate(new Date().toISOString())}\n\n` +
            `The code is now active and searchable.`,
        };
      } catch (error) {
        return {
          success: false,
          message: getErrorMessage(error),
        };
      }
    },
  },

  // ============================================================================
  // /research - Web Research
  // ============================================================================
  {
    name: "research",
    description: "Research referral codes for a domain",
    usage: "/research <domain> [depth]",
    aliases: ["scan", "investigate", "discover"],
    permissions: ["public", "verified", "moderator", "admin"],
    platforms: ["telegram", "discord"],
    execute: async (ctx, args, api) => {
      if (args.length < 1) {
        return {
          success: false,
          message:
            "❌ Usage: `/research <domain> [depth]`\n\n" +
            "Depths: `quick` (1 min), `thorough` (3 min), `deep` (5 min)\n\n" +
            "Example: `/research trading212.com thorough`",
        };
      }

      const domain = args[0];
      const depth = (args[1] as "quick" | "thorough" | "deep") || "thorough";

      // Validate depth
      if (!["quick", "thorough", "deep"].includes(depth)) {
        return {
          success: false,
          message: "❌ Invalid depth. Use: `quick`, `thorough`, or `deep`",
        };
      }

      // Initial response (research takes time)
      const initialMessage =
        `🔬 **Starting Research**\n\n` +
        `🎯 **Domain**: ${domain}\n` +
        `📊 **Depth**: ${depth}\n\n` +
        `⏳ Estimated time: ${depth === "quick" ? "1" : depth === "thorough" ? "3" : "5"} minute(s)\n\n` +
        `I'll search:\n` +
        `• Product Hunt discussions\n` +
        `• Reddit threads\n` +
        `• GitHub repositories\n` +
        `• Company website\n\n` +
        `Research in progress... 🔄`;

      try {
        // Start research
        const response = await api.research({
          query: `${domain} referral code`,
          domain,
          depth,
          sources: ["all"],
          max_results: 20,
        });

        if (response.discovered_codes === 0) {
          return {
            success: true,
            message:
              `🔬 **Research Complete**\n\n` +
              `🎯 **Domain**: ${domain}\n` +
              `⏱️ **Duration**: ${(response.research_metadata.research_duration_ms / 1000).toFixed(1)}s\n\n` +
              `❌ No referral codes found.\n\n` +
              `Try adding one manually: \`/add https://${domain}/invite/CODE\``,
          };
        }

        return {
          success: true,
          message:
            `🔬 **Research Complete!**\n\n` +
            `🎯 **Domain**: ${domain}\n` +
            `📊 **Found**: ${response.discovered_codes} code(s)\n` +
            `💾 **Stored**: ${response.stored_referrals} referral(s)\n` +
            `⏱️ **Duration**: ${(response.research_metadata.research_duration_ms / 1000).toFixed(1)}s\n\n` +
            `Use \`/search ${domain}\` to see the discovered codes.`,
        };
      } catch (error) {
        return {
          success: false,
          message: getErrorMessage(error),
        };
      }
    },
  },

  // ============================================================================
  // /stats - System Statistics
  // ============================================================================
  {
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
  },

  // ============================================================================
  // /help - Help Command
  // ============================================================================
  {
    name: "help",
    description: "Show help information for commands",
    usage: "/help [command]",
    aliases: ["commands", "?"],
    permissions: ["public", "verified", "moderator", "admin"],
    platforms: ["telegram", "discord"],
    execute: async (ctx, args, _api) => {
      if (args.length === 0) {
        // Show general help
        const commandList = commands
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
      const command = commands.find(
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
  },

  // ============================================================================
  // /start - Initialize Bot
  // ============================================================================
  {
    name: "start",
    description: "Initialize the bot and show welcome message",
    usage: "/start",
    aliases: [],
    permissions: ["public", "verified", "moderator", "admin"],
    platforms: ["telegram", "discord"],
    execute: async (ctx, _args, _api) => {
      const commandList = commands
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
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `❌ Error: ${error.message}`;
  }
  return "❌ An unexpected error occurred.";
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

// ============================================================================
// Command Lookup
// ============================================================================

export function findCommand(
  name: string,
  platform: "telegram" | "discord",
): CommandHandler | undefined {
  const normalizedName = name.toLowerCase().replace(/^\//, "");

  return commands.find(
    (cmd) =>
      cmd.platforms.includes(platform) &&
      (cmd.name === normalizedName || cmd.aliases?.includes(normalizedName)),
  );
}

// ============================================================================
// Parse Command Arguments
// ============================================================================

export function parseCommandArgs(input: string): {
  command: string;
  args: string[];
} {
  const parts = input.trim().split(/\s+/);
  const command = parts[0].toLowerCase().replace(/^\//, "");
  const args = parts.slice(1);

  return { command, args };
}
