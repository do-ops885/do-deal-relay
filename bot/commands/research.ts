/**
 * Research Commands
 *
 * Commands for researching referral codes from web sources.
 */

import { CommandHandler } from "./types";
import { getErrorMessage } from "./utils";

export const researchCommand: CommandHandler = {
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
};
