/**
 * Discord Slash Command Builders
 *
 * Slash command definitions for the Discord bot.
 */

import { SlashCommandBuilder } from "discord.js";

export function buildSlashCommands(): unknown[] {
  return [
    new SlashCommandBuilder()
      .setName("start")
      .setDescription("Initialize the bot and show welcome message"),

    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Show help information")
      .addStringOption((option) =>
        option
          .setName("command")
          .setDescription("Specific command to get help for")
          .setRequired(false),
      ),

    new SlashCommandBuilder()
      .setName("add")
      .setDescription("Add a new referral code")
      .addStringOption((option) =>
        option
          .setName("code")
          .setDescription("The referral code")
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("url")
          .setDescription("The complete referral URL")
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("reward")
          .setDescription("The reward/bonus for using this code")
          .setRequired(false),
      ),

    new SlashCommandBuilder()
      .setName("search")
      .setDescription("Search for referral codes by domain")
      .addStringOption((option) =>
        option
          .setName("domain")
          .setDescription("The domain to search for (e.g., trading212.com)")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("status")
          .setDescription("Filter by status")
          .setRequired(false)
          .addChoices(
            { name: "Active", value: "active" },
            { name: "All", value: "all" },
          ),
      ),

    new SlashCommandBuilder()
      .setName("get")
      .setDescription("Get detailed information about a referral code")
      .addStringOption((option) =>
        option
          .setName("code")
          .setDescription("The referral code to look up")
          .setRequired(true),
      ),

    new SlashCommandBuilder()
      .setName("deactivate")
      .setDescription("Deactivate a referral code (Moderator+)")
      .addStringOption((option) =>
        option
          .setName("code")
          .setDescription("The referral code to deactivate")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Reason for deactivation")
          .setRequired(true)
          .addChoices(
            { name: "Expired", value: "expired" },
            { name: "Invalid", value: "invalid" },
            { name: "Violation", value: "violation" },
            { name: "Replaced", value: "replaced" },
            { name: "User Request", value: "user_request" },
          ),
      )
      .addStringOption((option) =>
        option
          .setName("notes")
          .setDescription("Additional notes")
          .setRequired(false),
      ),

    new SlashCommandBuilder()
      .setName("reactivate")
      .setDescription("Reactivate a referral code (Moderator+)")
      .addStringOption((option) =>
        option
          .setName("code")
          .setDescription("The referral code to reactivate")
          .setRequired(true),
      ),

    new SlashCommandBuilder()
      .setName("research")
      .setDescription("Research referral codes for a domain")
      .addStringOption((option) =>
        option
          .setName("domain")
          .setDescription("The domain to research (e.g., wise.com)")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("depth")
          .setDescription("Research depth")
          .setRequired(false)
          .addChoices(
            { name: "Quick (1 min)", value: "quick" },
            { name: "Thorough (3 min)", value: "thorough" },
            { name: "Deep (5 min)", value: "deep" },
          ),
      ),

    new SlashCommandBuilder()
      .setName("stats")
      .setDescription("View system statistics"),
  ];
}
