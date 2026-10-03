import type { CommandHandler, CommandContext, CommandResult } from "./types";
import { getErrorMessage } from "./utils";
import type { DealRelayAPI } from "../api-client";

/**
 * Deal feedback commands (ADR-033 slice 2): let chat users report whether
 * a code worked, feeding the success-feedback loop through the same
 * /api/deals/:code/feedback route as the REST API (source_channel "bot").
 */

interface FeedbackOutcomeSpec {
  name: string;
  description: string;
  usage: string;
  outcome: "success" | "expired" | "invalid";
  confirmedMessage: string;
}

function createFeedbackCommand(spec: FeedbackOutcomeSpec): CommandHandler {
  return {
    name: spec.name,
    description: spec.description,
    usage: spec.usage,
    platforms: ["telegram", "discord"],
    permissions: ["public", "verified", "moderator", "admin"],

    async execute(
      _ctx: CommandContext,
      args: string[],
      api: DealRelayAPI,
    ): Promise<CommandResult> {
      const code = args[0];
      if (!code) {
        return {
          success: false,
          message: `❌ Please specify the deal code.\nUsage: \`${spec.usage}\``,
        };
      }

      try {
        const res = await api.reportDealFeedback(code, spec.outcome);

        const ratioPct = Math.round(res.feedback.successRatio * 100);
        const revision = res.inserted ? "" : " (revised your previous report)";

        return {
          success: true,
          message:
            `✅ Recorded that \`${code}\` **${spec.confirmedMessage}**${revision}.\n` +
            `📊 Community feedback: ${res.feedback.total} report(s), ` +
            `${ratioPct}% success rate.`,
        };
      } catch (e) {
        return {
          success: false,
          message: `❌ Error: ${getErrorMessage(e)}`,
        };
      }
    },
  };
}

export const workedCommand: CommandHandler = createFeedbackCommand({
  name: "worked",
  description: "Report that a deal code worked for you",
  usage: "/worked [code]",
  outcome: "success",
  confirmedMessage: "worked",
});

export const failedCommand: CommandHandler = createFeedbackCommand({
  name: "failed",
  description: "Report that a deal code did not work",
  usage: "/failed [code]",
  outcome: "invalid",
  confirmedMessage: "did not work",
});

export const expiredCommand: CommandHandler = createFeedbackCommand({
  name: "expired",
  description: "Report that a deal code has expired",
  usage: "/expired [code]",
  outcome: "expired",
  confirmedMessage: "expired",
});
