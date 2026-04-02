/**
 * Discord Bot Implementation for DealRelay
 *
 * Features:
 * - Slash commands with native Discord UI
 * - Rich embeds for referrals
 * - Role-based permissions
 * - Complete URL preservation
 */

import {
  Client,
  GatewayIntentBits,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  GuildMember,
  REST,
  Routes,
  Interaction,
} from "discord.js";
import { DealRelayAPI, initAPIClient, getAPIClient } from "../api-client";
import {
  CommandContext,
  CommandResult,
  CommandHandler,
  findCommand,
  hasPermission as checkPermission,
} from "../commands";
import {
  startConversation,
  getConversationState,
  endConversation,
  handleConversationMessage,
  conversations,
  ConversationHandler,
  getActiveConversation,
  cleanupExpiredConversations,
} from "../conversations";

// ============================================================================
// Configuration Types
// ============================================================================

export interface DiscordBotConfig {
  botToken: string;
  clientId: string;
  guildId?: string; // Optional - for guild-specific commands
  apiUrl: string;
  apiKey?: string;
  adminRoleIds?: string[];
  moderatorRoleIds?: string[];
  verifiedRoleIds?: string[];
  allowedChannelIds?: string[];
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
}

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function checkRateLimit(
  userId: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(userId);

  if (!entry || entry.resetAt < now) {
    const resetAt = now + windowMs;
    rateLimitStore.set(userId, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

// ============================================================================
// Permission Management
// ============================================================================

function getUserPermissions(
  member: GuildMember | null,
  config: DiscordBotConfig,
): CommandContext["permissions"] {
  if (!member) return ["public"];

  const roles = member.roles.cache.map((r) => r.id);

  // Check role-based permissions
  const isAdmin =
    config.adminRoleIds?.some((id) => roles.includes(id)) ||
    member.permissions.has(PermissionFlagsBits.Administrator);

  const isModerator =
    config.moderatorRoleIds?.some((id) => roles.includes(id)) ||
    member.permissions.has(PermissionFlagsBits.ModerateMembers);

  const isVerified = config.verifiedRoleIds?.some((id) => roles.includes(id));

  if (isAdmin) return ["public", "verified", "moderator", "admin"];
  if (isModerator) return ["public", "verified", "moderator"];
  if (isVerified) return ["public", "verified"];
  return ["public"];
}

function createCommandContext(
  interaction: ChatInputCommandInteraction,
  config: DiscordBotConfig,
): CommandContext {
  const member = interaction.member as GuildMember | null;

  return {
    platform: "discord",
    userId: interaction.user.id,
    username: interaction.user.username,
    isAdmin:
      member?.permissions.has(PermissionFlagsBits.Administrator) || false,
    permissions: getUserPermissions(member, config),
  };
}

// ============================================================================
// Embed Formatting
// ============================================================================

function createCommandEmbed(result: CommandResult): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(result.success ? "✅ Success" : "❌ Error")
    .setDescription(result.message)
    .setColor(result.success ? 0x00ff00 : 0xff0000)
    .setTimestamp();

  return embed;
}

function createReferralEmbed(referral: {
  code: string;
  url: string;
  domain: string;
  status: string;
  id: string;
  reward?: string;
  deactivated_at?: string;
  reason?: string;
}): EmbedBuilder {
  const statusColors: Record<string, number> = {
    active: 0x00ff00,
    quarantined: 0xffaa00,
    inactive: 0xff0000,
    expired: 0x808080,
  };

  const embed = new EmbedBuilder()
    .setTitle(`📋 Referral: ${referral.code}`)
    .setURL(referral.url) // Complete URL as embed link
    .setColor(statusColors[referral.status] || 0x808080)
    .addFields(
      { name: "🎯 Domain", value: referral.domain, inline: true },
      { name: "📊 Status", value: referral.status, inline: true },
      { name: "🆔 ID", value: `\`${referral.id}\``, inline: false },
      { name: "🔗 URL", value: referral.url, inline: false }, // Complete URL shown
    )
    .setTimestamp();

  if (referral.reward) {
    embed.addFields({
      name: "🎁 Reward",
      value: referral.reward,
      inline: true,
    });
  }

  if (referral.deactivated_at) {
    embed.addFields({
      name: "🚫 Deactivated",
      value: new Date(referral.deactivated_at).toLocaleString(),
      inline: true,
    });
  }

  return embed;
}

function createButtons(result: CommandResult) {
  if (!result.buttons || result.buttons.length === 0) {
    return undefined;
  }

  const buttons = result.buttons.map((btn) =>
    new ButtonBuilder()
      .setCustomId(`${btn.action}:${btn.data || ""}`)
      .setLabel(btn.text)
      .setStyle(ButtonStyle.Primary),
  );

  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

// ============================================================================
// Slash Command Builders
// ============================================================================

function buildSlashCommands(): unknown[] {
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

// ============================================================================
// Command Handlers
// ============================================================================

async function handleSlashCommand(
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

// ============================================================================
// Conversation Flow Handlers
// ============================================================================

async function startConversationFlow(
  interaction: ChatInputCommandInteraction,
  conversationName: string,
): Promise<void> {
  const userId = interaction.user.id;
  const conversation = conversations.find((c) => c.name === conversationName);

  if (!conversation) {
    await interaction.reply({
      content: "❌ Conversation flow not found.",
      ephemeral: true,
    });
    return;
  }

  startConversation(userId, conversationName);

  await interaction.reply({
    content: conversation.steps[0].question,
    ephemeral: true,
  });
}

// ============================================================================
// Button Handler
// ============================================================================

async function handleButtonInteraction(
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

// Discord bots typically use gateway connections, not webhooks
// But we provide a webhook handler for interaction endpoints if needed

export async function handleDiscordWebhook(
  request: Request,
  config: DiscordBotConfig,
): Promise<Response> {
  // Discord interactions use a different verification mechanism
  // This is a placeholder for interaction endpoint handling

  try {
    const signature = request.headers.get("X-Signature-Ed25519");
    const timestamp = request.headers.get("X-Signature-Timestamp");

    if (!signature || !timestamp) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Note: Full verification requires the tweetnacl library
    // This is a simplified placeholder

    const body = await request.json();

    // Handle ping
    if (body.type === 1) {
      return new Response(JSON.stringify({ type: 1 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle command
    // This would need to be implemented with proper Discord interaction handling
    return new Response(JSON.stringify({ type: 5 }), {
      // Deferred response
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Discord webhook error:", error);
    return new Response("Error", { status: 500 });
  }
}
