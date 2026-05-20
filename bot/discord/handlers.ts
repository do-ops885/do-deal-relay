/**
 * Discord Bot Command Handlers
 *
 * Interaction handlers for slash commands and buttons.
 */

import {
  Client,
  GatewayIntentBits,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  Interaction,
  ButtonInteraction,
  REST,
  Routes,
} from "discord.js";
import { DealRelayAPI, initAPIClient, getAPIClient } from "../api-client";
import { findCommand, hasPermission as checkPermission } from "../commands";
import { cleanupExpiredConversations } from "../conversations";
import { DiscordBotConfig } from "./types";
import { checkRateLimit } from "./ratelimit";
import { createCommandContext } from "./permissions";
import { createCommandEmbed, createButtons } from "./embeds";

async function startConversationFlow(
  interaction: ChatInputCommandInteraction,
  conversationName: string,
): Promise<void> {
  const userId = interaction.user.id;

  await interaction.reply({
    content: `Starting ${conversationName} flow... (Please use DM for conversation flows)`,
    ephemeral: true,
  });
}

export async function handleSlashCommand(
  interaction: ChatInputCommandInteraction,
  config: DiscordBotConfig,
): Promise<void> {
  // Check channel restrictions
  if (
    config.allowedChannelIds &&
    config.allowedChannelIds.length > 0 &&
    interaction.channelId
  ) {
    if (!config.allowedChannelIds.includes(interaction.channelId)) {
      await interaction.reply({
        content: "🚫 This command cannot be used in this channel.",
        ephemeral: true,
      });
      return;
    }
  }

  // Check rate limit
  const rateLimit = checkRateLimit(
    interaction.user.id,
    config.rateLimitMaxRequests || 5,
    config.rateLimitWindowMs || 10000,
  );

  if (!rateLimit.allowed) {
    const resetDate = new Date(rateLimit.resetAt);
    await interaction.reply({
      content: `⏳ Rate limit exceeded. Try again at ${resetDate.toLocaleTimeString()}.`,
      ephemeral: true,
    });
    return;
  }

  // Initialize API client
  let api: DealRelayAPI;
  try {
    api = getAPIClient();
  } catch {
    initAPIClient({
      baseUrl: config.apiUrl,
      apiKey: config.apiKey,
    });
    api = getAPIClient();
  }

  // Create command context
  const ctx = createCommandContext(interaction, config);

  const commandName = interaction.commandName;
  const command = findCommand(commandName, "discord");

  if (!command) {
    await interaction.reply({
      content: `❓ Unknown command: \`/${commandName}\``,
      ephemeral: true,
    });
    return;
  }

  // Check permissions
  if (!checkPermission(ctx, command.permissions)) {
    await interaction.reply({
      content: `🔒 You don't have permission to use \`/${command.name}\`.`,
      ephemeral: true,
    });
    return;
  }

  // Handle conversation flows for interactive commands
  if (commandName === "add") {
    const code = interaction.options.getString("code");
    const url = interaction.options.getString("url");

    if (!code || !url) {
      // Start conversation flow
      await startConversationFlow(interaction, "ADD_CODE_FLOW");
      return;
    }
  }

  if (commandName === "research") {
    const domain = interaction.options.getString("domain");
    const depth =
      (interaction.options.getString("depth") as
        | "quick"
        | "thorough"
        | "deep") || "thorough";

    if (!domain) {
      await startConversationFlow(interaction, "RESEARCH_FLOW");
      return;
    }

    // Execute immediately if domain provided
    await interaction.deferReply();

    try {
      const response = await api.research({
        query: `${domain} referral code`,
        domain,
        depth,
        sources: ["all"],
        max_results: 20,
      });

      const message =
        response.discovered_codes === 0
          ? `🔬 **Research Complete**\n\n` +
            `🎯 **Domain**: ${domain}\n` +
            `⏱️ **Duration**: ${(response.research_metadata.research_duration_ms / 1000).toFixed(1)}s\n\n` +
            `❌ No referral codes found.`
          : `🔬 **Research Complete!**\n\n` +
            `🎯 **Domain**: ${domain}\n` +
            `📊 **Found**: ${response.discovered_codes} code(s)\n` +
            `💾 **Stored**: ${response.stored_referrals} referral(s)\n` +
            `⏱️ **Duration**: ${(response.research_metadata.research_duration_ms / 1000).toFixed(1)}s`;

      await interaction.editReply({ content: message });
    } catch (error) {
      await interaction.editReply({
        content: `❌ Error: ${error instanceof Error ? error.message : "Research failed"}`,
      });
    }
    return;
  }

  // Build arguments from options
  const args: string[] = [];

  if (commandName === "add") {
    const code = interaction.options.getString("code");
    const url = interaction.options.getString("url");
    const reward = interaction.options.getString("reward");
    if (code) args.push(code);
    if (url) args.push(url);
    if (reward) args.push(reward);
  } else if (commandName === "search") {
    const domain = interaction.options.getString("domain");
    const status = interaction.options.getString("status") || "active";
    if (domain) args.push(domain, status);
  } else if (commandName === "get") {
    const code = interaction.options.getString("code");
    if (code) args.push(code);
  } else if (commandName === "deactivate") {
    const code = interaction.options.getString("code");
    const reason = interaction.options.getString("reason");
    const notes = interaction.options.getString("notes");
    if (code) args.push(code);
    if (reason) args.push(reason);
    if (notes) args.push(notes);
  } else if (commandName === "reactivate") {
    const code = interaction.options.getString("code");
    if (code) args.push(code);
  }

  // Execute command
  try {
    const result = await command.execute(ctx, args, api);

    const embed = createCommandEmbed(result);
    const buttons = createButtons(result);

    const replyOptions: Parameters<typeof interaction.reply>[0] = {
      embeds: [embed],
      ...(result.success ? {} : { ephemeral: true }),
    };

    if (buttons) {
      replyOptions.components = [buttons];
    }

    await interaction.reply(replyOptions);
  } catch (error) {
    console.error("Command execution error:", error);
    await interaction.reply({
      content: "❌ An error occurred while processing your command.",
      ephemeral: true,
    });
  }
}

export async function handleButtonInteraction(
  interaction: ButtonInteraction,
  config: DiscordBotConfig,
): Promise<void> {
  const [action, data] = interaction.customId.split(":");

  let api: DealRelayAPI;
  try {
    api = getAPIClient();
  } catch {
    initAPIClient({
      baseUrl: config.apiUrl,
      apiKey: config.apiKey,
    });
    api = getAPIClient();
  }

  const ctx = createCommandContext(
    interaction as unknown as ChatInputCommandInteraction,
    config,
  );

  switch (action) {
    case "get": {
      const command = findCommand("get", "discord");
      if (command) {
        const result = await command.execute(ctx, [data], api);
        const embed = createCommandEmbed(result);
        await interaction.update({ embeds: [embed], components: [] });
      }
      break;
    }
    case "deactivate": {
      const command = findCommand("deactivate", "discord");
      if (command) {
        const result = await command.execute(ctx, [data, "user_request"], api);
        const embed = createCommandEmbed(result);
        await interaction.update({ embeds: [embed], components: [] });
      }
      break;
    }
    case "reactivate": {
      const command = findCommand("reactivate", "discord");
      if (command) {
        const result = await command.execute(ctx, [data], api);
        const embed = createCommandEmbed(result);
        await interaction.update({ embeds: [embed], components: [] });
      }
      break;
    }
    default:
      await interaction.reply({
        content: "❌ Unknown button action.",
        ephemeral: true,
      });
  }
}
