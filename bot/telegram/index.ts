/**
 * Telegram Bot Implementation for DealRelay
 *
 * Features:
 * - Command-based interaction
 * - Conversation flows for adding referrals
 * - Complete URL preservation
 * - Rate limiting support
 */

import { Telegraf, Context as TelegrafContext, Markup } from "telegraf";
import { DealRelayAPI, initAPIClient, getAPIClient } from "../api-client";
import {
  CommandContext,
  CommandResult,
  findCommand,
  parseCommandArgs,
} from "../commands";
import {
  startConversation,
  getConversationState,
  endConversation,
  handleConversationMessage,
  conversations,
  cleanupExpiredConversations,
} from "../conversations";

// ============================================================================
// Configuration Types
// ============================================================================

export interface TelegramBotConfig {
  botToken: string;
  apiUrl: string;
  apiKey?: string;
  adminUserIds?: string[];
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
}

// ============================================================================
// Rate Limiting (Simple In-Memory)
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
    // New window
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
// User Permission Management
// ============================================================================

function getUserPermissions(
  ctx: TelegrafContext,
  config: TelegramBotConfig,
): CommandContext {
  const userId = ctx.from?.id.toString() || "unknown";
  const username = ctx.from?.username || ctx.from?.first_name || "Unknown";

  // Check if user is admin
  const isAdmin = config.adminUserIds?.includes(userId) || false;

  // Determine permissions based on role
  const permissions: CommandContext["permissions"] = isAdmin
    ? ["public", "verified", "moderator", "admin"]
    : ctx.chat?.type === "private"
      ? ["public", "verified"]
      : ["public"];

  return {
    platform: "telegram",
    userId,
    username,
    isAdmin,
    permissions,
  };
}

// ============================================================================
// Message Formatting
// ============================================================================

function escapeMarkdown(text: string): string {
  // Escape special characters for Telegram MarkdownV2
  return text.replace(/([_\*\[\]()~`>#+=|{}.!-])/g, "\\$1");
}

function escapeUrl(url: string): string {
  // Don't escape the URL itself, just the display text if needed
  return url;
}

function formatTelegramMessage(result: CommandResult): string {
  // Note: We don't escape the URL to preserve complete links
  return result.message;
}

// ============================================================================
// Button Rendering
// ============================================================================

function renderButtons(result: CommandResult) {
  if (!result.buttons || result.buttons.length === 0) {
    return undefined;
  }

  const buttons = result.buttons.map((btn) =>
    Markup.button.callback(btn.text, `${btn.action}:${btn.data || ""}`),
  );

  return Markup.inlineKeyboard(buttons, { columns: 2 });
}

// ============================================================================
// Command Handler
// ============================================================================

async function handleBotCommand(
  ctx: TelegrafContext,
  config: TelegramBotConfig,
): Promise<void> {
  const message = ctx.message;
  if (!message || !("text" in message)) return;

  const text = message.text;
  if (!text) return;

  // Check for cancel command
  if (text.toLowerCase() === "cancel") {
    const userId = ctx.from?.id.toString();
    if (userId && getConversationState(userId)) {
      endConversation(userId);
      await ctx.reply("❌ Conversation cancelled.");
      return;
    }
  }

  // Get user context
  const userCtx = getUserPermissions(ctx, config);

  // Check rate limit
  const rateLimit = checkRateLimit(
    userCtx.userId,
    config.rateLimitMaxRequests || 30,
    config.rateLimitWindowMs || 60000,
  );

  if (!rateLimit.allowed) {
    const resetDate = new Date(rateLimit.resetAt);
    await ctx.reply(
      `⏳ Rate limit exceeded. Please try again at ${resetDate.toLocaleTimeString()}.`,
    );
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

  // Check if user is in a conversation
  const conversationState = getConversationState(userCtx.userId);
  if (conversationState) {
    const result = await handleConversationMessage(
      userCtx.userId,
      text,
      userCtx,
      api,
    );

    if (result) {
      await ctx.reply(formatTelegramMessage(result), {
        parse_mode: "Markdown",
        ...renderButtons(result),
      });
    } else {
      // No active conversation, treat as normal message
      await ctx.reply(
        "❓ You're not in an active conversation. Use /help to see available commands.",
      );
    }
    return;
  }

  // Parse command
  const { command, args } = parseCommandArgs(text);

  // Find the command handler
  const commandHandler = findCommand(command, "telegram");

  if (!commandHandler) {
    await ctx.reply(
      `❓ Unknown command \`/${command}\`. Use /help to see available commands.`,
      { parse_mode: "Markdown" },
    );
    return;
  }

  // Check permissions
  const hasPermission = userCtx.permissions.some((p) =>
    commandHandler.permissions.includes(p),
  );

  if (!hasPermission) {
    await ctx.reply(
      `🔒 You don't have permission to use \`/${commandHandler.name}\`.`,
      { parse_mode: "Markdown" },
    );
    return;
  }

  // Execute the command
  try {
    const result = await commandHandler.execute(userCtx, args, api);

    // Send response
    const keyboard = renderButtons(result);
    await ctx.reply(formatTelegramMessage(result), {
      parse_mode: "Markdown",
      ...(keyboard ? keyboard : {}),
    });
  } catch (error) {
    console.error("Command execution error:", error);
    await ctx.reply(
      `❌ An error occurred while processing your command. Please try again later.`,
    );
  }
}

// ============================================================================
// Conversation Starter
// ============================================================================

async function startConversationFlow(
  ctx: TelegrafContext,
  conversationName: string,
): Promise<void> {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const conversation = conversations.find((c) => c.name === conversationName);
  if (!conversation) {
    await ctx.reply("❌ Conversation flow not found.");
    return;
  }

  // Start the conversation
  startConversation(userId, conversationName);

  // Send the first question
  const firstStep = conversation.steps[0];
  await ctx.reply(firstStep.question, { parse_mode: "Markdown" });
}

// ============================================================================
// Bot Factory
// ============================================================================

export function createTelegramBot(config: TelegramBotConfig): Telegraf {
  // Initialize API client
  initAPIClient({
    baseUrl: config.apiUrl,
    apiKey: config.apiKey,
  });

  // Create bot
  const bot = new Telegraf(config.botToken);

  // Middleware: Check if bot is configured
  bot.use(async (ctx, next) => {
    if (!config.apiUrl) {
      await ctx.reply(
        "🔧 Bot is not fully configured. Please contact the administrator.",
      );
      return;
    }
    return next();
  });

  // Command handlers
  bot.command("start", async (ctx) => {
    await handleBotCommand(ctx, config);
  });

  bot.command("help", async (ctx) => {
    await handleBotCommand(ctx, config);
  });

  bot.command("add", async (ctx) => {
    // Check if no args - start conversation flow
    const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
    const args = text.split(/\s+/).slice(1);

    if (args.length === 0) {
      await startConversationFlow(ctx, "ADD_CODE_FLOW");
    } else {
      await handleBotCommand(ctx, config);
    }
  });

  bot.command("search", async (ctx) => {
    await handleBotCommand(ctx, config);
  });

  bot.command("get", async (ctx) => {
    await handleBotCommand(ctx, config);
  });

  bot.command("deactivate", async (ctx) => {
    await handleBotCommand(ctx, config);
  });

  bot.command("reactivate", async (ctx) => {
    await handleBotCommand(ctx, config);
  });

  bot.command("research", async (ctx) => {
    // Check if no args - start conversation flow
    const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
    const args = text.split(/\s+/).slice(1);

    if (args.length === 0) {
      await startConversationFlow(ctx, "RESEARCH_FLOW");
    } else {
      await handleBotCommand(ctx, config);
    }
  });

  bot.command("stats", async (ctx) => {
    await handleBotCommand(ctx, config);
  });

  // Handle callback queries (buttons)
  bot.on("callback_query", async (ctx) => {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !("data" in callbackQuery)) return;

    const callbackData = callbackQuery.data;
    if (!callbackData) return;

    const [action, data] = callbackData.split(":");

    switch (action) {
      case "get":
        // Simulate /get command
        if (callbackQuery.message && "text" in callbackQuery.message) {
          const text = `/get ${data}`;
          (callbackQuery.message as { text: string }).text = text;
          await handleBotCommand(ctx as unknown as TelegrafContext, config);
        }
        break;
      case "deactivate":
        // Simulate /deactivate command
        if (callbackQuery.message && "text" in callbackQuery.message) {
          const text = `/deactivate ${data}`;
          (callbackQuery.message as { text: string }).text = text;
          await handleBotCommand(ctx as unknown as TelegrafContext, config);
        }
        break;
      case "reactivate":
        // Simulate /reactivate command
        if (callbackQuery.message && "text" in callbackQuery.message) {
          const text = `/reactivate ${data}`;
          (callbackQuery.message as { text: string }).text = text;
          await handleBotCommand(ctx as unknown as TelegrafContext, config);
        }
        break;
    }

    await ctx.answerCbQuery();
  });

  // Handle text messages (for conversations)
  bot.on("text", async (ctx) => {
    await handleBotCommand(ctx, config);
  });

  // Error handling
  bot.catch((err, ctx) => {
    console.error("Telegram bot error:", err);
    ctx
      .reply("❌ An error occurred. Please try again later.")
      .catch(console.error);
  });

  // Periodic cleanup of expired conversations
  setInterval(() => {
    cleanupExpiredConversations(30);
  }, 60000); // Run every minute

  return bot;
}

// ============================================================================
// Launcher (for direct execution)
// ============================================================================

export async function launchTelegramBot(
  config: TelegramBotConfig,
): Promise<void> {
  const bot = createTelegramBot(config);

  // Enable graceful stop
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  // Launch bot
  await bot.launch();
  console.log("🤖 Telegram bot started");
}

// ============================================================================
// Webhook Mode (for Cloudflare Workers)
// ============================================================================

export async function handleTelegramWebhook(
  request: Request,
  config: TelegramBotConfig,
): Promise<Response> {
  const bot = createTelegramBot(config);

  try {
    const update = await request.json();
    await bot.handleUpdate(update);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("Error", { status: 500 });
  }
}
