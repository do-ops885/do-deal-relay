/**
 * Discord Bot Implementation for DealRelay
 *
 * Main entry point - thin wrapper that exports all Discord bot functionality.
 */

// Export types
export type {
  DiscordBotConfig,
  RateLimitEntry,
  RateLimitResult,
} from "./types";

// Export core functions
export { buildSlashCommands } from "./commands";
export { handleSlashCommand, handleButtonInteraction } from "./handlers";
export {
  createCommandEmbed,
  createReferralEmbed,
  createButtons,
} from "./embeds";
export { createCommandContext, getUserPermissions } from "./permissions";
export { checkRateLimit } from "./ratelimit";

// Import for implementation
import {
  Client,
  REST,
  Routes,
  SlashCommandBuilder,
  Interaction,
  GatewayIntentBits,
} from "discord.js";
import { initAPIClient } from "../api-client";
import { cleanupExpiredConversations } from "../conversations";
import { DiscordBotConfig } from "./types";
import { buildSlashCommands } from "./commands";
import { handleSlashCommand, handleButtonInteraction } from "./handlers";

// ============================================================================
// Command Registration
// ============================================================================

export async function registerSlashCommands(
  config: DiscordBotConfig,
): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.botToken);

  const commands = buildSlashCommands().map((cmd) =>
    (cmd as SlashCommandBuilder).toJSON(),
  );

  try {
    console.log("🔄 Refreshing Discord slash commands...");

    if (config.guildId) {
      // Guild-specific commands (faster for testing)
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commands },
      );
      console.log(`✅ Guild commands registered for ${config.guildId}`);
    } else {
      // Global commands (takes up to 1 hour to propagate)
      await rest.put(Routes.applicationCommands(config.clientId), {
        body: commands,
      });
      console.log("✅ Global commands registered");
    }
  } catch (error) {
    console.error("❌ Failed to register commands:", error);
    throw error;
  }
}

// ============================================================================
// Bot Factory
// ============================================================================

export function createDiscordBot(config: DiscordBotConfig): Client {
  // Initialize API client
  initAPIClient({
    baseUrl: config.apiUrl,
    apiKey: config.apiKey,
  });

  // Create client
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
    ],
  });

  // Ready event
  client.once("ready", () => {
    console.log(`🤖 Discord bot logged in as ${client.user?.tag}`);
  });

  // Interaction handler
  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction, config);
      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction, config);
      }
    } catch (error) {
      console.error("Interaction error:", error);
      if (interaction.isRepliable()) {
        await interaction
          .reply({
            content: "❌ An error occurred while processing your interaction.",
            ephemeral: true,
          })
          .catch(() => {
            // Interaction may have already been acknowledged
          });
      }
    }
  });

  // Periodic cleanup
  setInterval(() => {
    cleanupExpiredConversations(30);
  }, 60000);

  return client;
}

// ============================================================================
// Launcher
// ============================================================================

export async function launchDiscordBot(
  config: DiscordBotConfig,
): Promise<void> {
  // Register slash commands first
  await registerSlashCommands(config);

  // Create and login
  const client = createDiscordBot(config);
  await client.login(config.botToken);
}

// ============================================================================
// Webhook Mode (for Cloudflare Workers)
// ============================================================================

export async function handleDiscordWebhook(
  request: Request,
  config: DiscordBotConfig,
): Promise<Response> {
  try {
    const signature = request.headers.get("X-Signature-Ed25519");
    const timestamp = request.headers.get("X-Signature-Timestamp");

    if (!signature || !timestamp) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.json();

    // Handle ping
    if (body.type === 1) {
      return new Response(JSON.stringify({ type: 1 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle command - deferred response
    return new Response(JSON.stringify({ type: 5 }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Discord webhook error:", error);
    return new Response("Error", { status: 500 });
  }
}
