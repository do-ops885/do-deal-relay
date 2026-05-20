import { DealRelayAPI } from "./api-client";
import { CommandContext, CommandResult } from "./commands";

// ============================================================================
// Conversation State Management
// ============================================================================

export type ConversationState =
  | "IDLE"
  | "ADD_CODE_FLOW"
  | "RESEARCH_FLOW"
  | "BULK_IMPORT_FLOW"
  | "ADMIN_SETUP";

export interface ConversationData {
  step: number;
  data: Record<string, unknown>;
  lastActivity: Date;
}

// In-memory conversation store (use Redis/KV for production)
const conversationStore = new Map<string, ConversationData>();

// ============================================================================
// Add Code Conversation Flow
// ============================================================================

export const ADD_CODE_FLOW: ConversationStep[] = [
  {
    id: "code",
    question: "Step 1/4: What's the referral code?\n\n(e.g., DOMI6869)",
    validate: (input: string): boolean =>
      input.length >= 1 && input.length <= 100,
    errorMessage: "Code must be between 1 and 100 characters.",
  },
  {
    id: "url",
    question:
      "Step 2/4: What's the complete referral URL?\n\n(e.g., https://picnic.app/de/freunde-rabatt/DOMI6869)",
    validate: (input: string): boolean => {
      try {
        const url = new URL(input);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    errorMessage:
      "Please provide a valid URL starting with http:// or https://",
  },
  {
    id: "reward",
    question:
      "Step 3/4: What's the reward/bonus? (optional)\n\n" +
      "(e.g., 'Free €20 credit', '50% off first month', 'Skip for none')",
    validate: (): boolean => true, // Optional field
    optional: true,
  },
  {
    id: "notes",
    question:
      "Step 4/4: Any notes or tags? (optional)\n\n" +
      "(e.g., 'Popular in Germany', 'New user only')\n" +
      "Say 'skip' to proceed without notes.",
    validate: (): boolean => true, // Optional field
    optional: true,
  },
];

// ============================================================================
// Research Conversation Flow
// ============================================================================

export const RESEARCH_FLOW: ConversationStep[] = [
  {
    id: "domain",
    question: "What domain should I research?\n\n(e.g., trading212.com)",
    validate: (input: string): boolean => {
      // Basic domain validation
      const domainRegex =
        /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
      return domainRegex.test(input) || input.includes(".");
    },
    errorMessage: "Please provide a valid domain (e.g., example.com).",
  },
  {
    id: "depth",
    question:
      "What depth should I search?\n\n" +
      "1️⃣ Quick (1 min) - Basic search\n" +
      "2️⃣ Thorough (3 min) - Full sources\n" +
      "3️⃣ Deep (5 min) - Comprehensive",
    validate: (input: string): boolean => {
      const normalized = input.toLowerCase().trim();
      return (
        ["1", "2", "3", "quick", "thorough", "deep"].includes(normalized) ||
        input.includes("quick") ||
        input.includes("thorough") ||
        input.includes("deep")
      );
    },
    errorMessage: "Please choose: quick, thorough, or deep",
    transform: (input: string): string => {
      const normalized = input.toLowerCase().trim();
      if (normalized === "1" || normalized.includes("quick")) return "quick";
      if (normalized === "3" || normalized.includes("deep")) return "deep";
      return "thorough"; // Default
    },
  },
];

// ============================================================================
// Types
// ============================================================================

export interface ConversationStep {
  id: string;
  question: string;
  validate: (input: string) => boolean;
  errorMessage?: string;
  optional?: boolean;
  transform?: (input: string) => string;
}

export interface ConversationHandler {
  name: string;
  steps: ConversationStep[];
  onComplete: (
    ctx: CommandContext,
    data: Record<string, unknown>,
    api: DealRelayAPI,
  ) => Promise<CommandResult>;
}

// ============================================================================
// Conversation Handlers Registry
// ============================================================================

export const conversations: ConversationHandler[] = [
  {
    name: "ADD_CODE_FLOW",
    steps: ADD_CODE_FLOW,
    onComplete: async (ctx, data, api) => {
      const code = data.code as string;
      const url = data.url as string;
      const reward = data.reward as string | undefined;
      const notes = data.notes as string | undefined;

      // Skip if user said "skip"
      const finalNotes = notes?.toLowerCase() === "skip" ? undefined : notes;
      const finalReward = reward?.toLowerCase() === "skip" ? undefined : reward;

      // Extract domain from URL
      let domain: string;
      try {
        const parsedUrl = new URL(url);
        domain = parsedUrl.hostname.replace(/^www\./, "");
      } catch {
        return {
          success: false,
          message: "❌ Invalid URL provided.",
        };
      }

      try {
        const response = await api.createReferral({
          code,
          url, // Complete URL
          domain,
          source: ctx.platform,
          submitted_by: ctx.userId,
          metadata: {
            title: `${domain} Referral`,
            reward_value: finalReward,
            category: ["general"],
            tags: ["conversation-flow", ctx.platform],
            notes: finalNotes,
          },
        });

        return {
          success: true,
          message:
            `✅ **Referral Added Successfully!**\n\n` +
            `🎯 **Code**: \`${response.referral.code}\`\n` +
            `🔗 **URL**: ${response.referral.url}\n` +
            `🌐 **Domain**: ${response.referral.domain}\n` +
            `📊 **Status**: ${response.referral.status}\n` +
            `🆔 **ID**: \`${response.referral.id}\`\n\n` +
            (finalReward ? `🎁 **Reward**: ${finalReward}\n\n` : "") +
            `The code will be validated and activated shortly.`,
        };
      } catch (error) {
        return {
          success: false,
          message: `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  },
  {
    name: "RESEARCH_FLOW",
    steps: RESEARCH_FLOW,
    onComplete: async (ctx, data, api) => {
      const domain = data.domain as string;
      const depth = data.depth as "quick" | "thorough" | "deep";

      try {
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
          message: `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  },
];

// ============================================================================
// Conversation Store Functions
// ============================================================================

export function startConversation(
  userId: string,
  conversationName: string,
): boolean {
  const conversation = conversations.find((c) => c.name === conversationName);
  if (!conversation) return false;

  conversationStore.set(userId, {
    step: 0,
    data: {},
    lastActivity: new Date(),
  });

  return true;
}

export function getConversationState(userId: string): ConversationData | null {
  return conversationStore.get(userId) || null;
}

export function updateConversation(
  userId: string,
  updates: Partial<ConversationData>,
): boolean {
  const state = conversationStore.get(userId);
  if (!state) return false;

  conversationStore.set(userId, {
    ...state,
    ...updates,
    lastActivity: new Date(),
  });

  return true;
}

export function setConversationData(
  userId: string,
  key: string,
  value: unknown,
): boolean {
  const state = conversationStore.get(userId);
  if (!state) return false;

  state.data[key] = value;
  state.lastActivity = new Date();
  return true;
}

export function advanceConversationStep(userId: string): boolean {
  const state = conversationStore.get(userId);
  if (!state) return false;

  state.step++;
  state.lastActivity = new Date();
  return true;
}

export function endConversation(userId: string): boolean {
  return conversationStore.delete(userId);
}

export function getActiveConversation(
  userId: string,
): ConversationHandler | null {
  const state = conversationStore.get(userId);
  if (!state) return null;

  // Find the active conversation handler
  // We need to track which conversation is active - for now, assume based on data keys
  if (state.data.code !== undefined) {
    return conversations.find((c) => c.name === "ADD_CODE_FLOW") || null;
  }
  if (state.data.domain !== undefined) {
    return conversations.find((c) => c.name === "RESEARCH_FLOW") || null;
  }

  return null;
}

export function getCurrentStep(
  conversation: ConversationHandler,
  userId: string,
): ConversationStep | null {
  const state = conversationStore.get(userId);
  if (!state) return null;

  return conversation.steps[state.step] || null;
}

// ============================================================================
// Conversation Message Handler
// ============================================================================

export async function handleConversationMessage(
  userId: string,
  message: string,
  ctx: CommandContext,
  api: DealRelayAPI,
): Promise<CommandResult | null> {
  const state = conversationStore.get(userId);
  if (!state) return null;

  const conversation = getActiveConversation(userId);
  if (!conversation) {
    endConversation(userId);
    return null;
  }

  const currentStep = getCurrentStep(conversation, userId);
  if (!currentStep) {
    // Conversation is complete, process it
    const result = await conversation.onComplete(ctx, state.data, api);
    endConversation(userId);
    return result;
  }

  // Validate the input
  let transformedValue = message;
  if (currentStep.transform) {
    transformedValue = currentStep.transform(message);
  }

  const isValid = currentStep.validate(transformedValue);

  if (!isValid && !currentStep.optional) {
    return {
      success: false,
      message:
        `❌ ${currentStep.errorMessage || "Invalid input."}\n\n` +
        `Please try again or type 'cancel' to exit.`,
    };
  }

  // Store the data
  setConversationData(userId, currentStep.id, transformedValue);

  // Check if there's a next step
  const nextStepIndex = state.step + 1;
  if (nextStepIndex >= conversation.steps.length) {
    // Conversation is complete
    const result = await conversation.onComplete(ctx, state.data, api);
    endConversation(userId);
    return result;
  }

  // Advance to next step
  advanceConversationStep(userId);
  const nextStep = conversation.steps[nextStepIndex];

  return {
    success: true,
    message: nextStep.question,
  };
}

// ============================================================================
// Timeout Cleanup (optional)
// ============================================================================

export function cleanupExpiredConversations(maxAgeMinutes: number = 30): void {
  const now = new Date();
  const maxAgeMs = maxAgeMinutes * 60 * 1000;

  const entries = Array.from(conversationStore.entries());
  for (const [userId, state] of entries) {
    if (now.getTime() - state.lastActivity.getTime() > maxAgeMs) {
      conversationStore.delete(userId);
    }
  }
}
