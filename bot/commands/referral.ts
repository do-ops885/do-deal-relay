/**
 * Referral Commands
 *
 * Commands for managing referral codes: add, search, get, deactivate, reactivate.
 */

import { CommandHandler } from "./types";
import { getErrorMessage, formatDate } from "./utils";

export const addCommand: CommandHandler = {
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
};

export const searchCommand: CommandHandler = {
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
};

export const getCommand: CommandHandler = {
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
};

export const deactivateCommand: CommandHandler = {
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
};

export const reactivateCommand: CommandHandler = {
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
};
