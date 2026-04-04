import { z } from "zod";
import type { Env } from "../../../types";
import type { ToolCallResult } from "../types";
import {
  getReferralByCode,
  storeReferralInput,
} from "../../referral-storage/crud";

export const ExperienceDealInputSchema = z.object({
  code: z.string().describe("The referral code used"),
  success: z.boolean().describe("Whether the deal was successfully used"),
  comment: z
    .string()
    .optional()
    .describe("Optional comment about the experience"),
});

/**
 * Experience deal tool handler
 * Allows users/agents to report success/failure with a deal
 */
export async function handleExperienceDeal(
  args: z.infer<typeof ExperienceDealInputSchema>,
  env: Env,
): Promise<ToolCallResult> {
  const { code, success, comment } = args;

  const referral = await getReferralByCode(env, code);

  if (!referral) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Referral code "${code}" not found.`,
        },
      ],
      isError: true,
    };
  }

  // Update referral metadata with the experience
  referral.metadata = referral.metadata || {};
  const experiences = (referral.metadata.experiences as any[]) || [];

  experiences.push({
    success,
    comment,
    timestamp: new Date().toISOString(),
    source: "mcp_interaction",
  });

  referral.metadata.experiences = experiences;

  // Adjust confidence score based on experience
  let currentScore = referral.metadata.confidence_score ?? 0.5;
  if (success) {
    // Increase confidence on success
    currentScore = Math.min(1.0, currentScore + 0.05);
  } else {
    // Decrease confidence on failure
    currentScore = Math.max(0.0, currentScore - 0.1);
  }
  referral.metadata.confidence_score = currentScore;

  // Store updated referral
  await storeReferralInput(env, referral);

  const statusMsg = success ? "✅ Success reported" : "⚠️ Failure reported";
  const resultMsg = `${statusMsg} for code "${code}". New confidence score: ${currentScore.toFixed(2)}.`;

  return {
    content: [
      {
        type: "text",
        text: resultMsg,
      },
      {
        type: "resource",
        resource: {
          uri: `deals://${code}/experience`,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              success: true,
              code,
              reported_success: success,
              new_confidence: currentScore,
              total_experiences: experiences.length,
            },
            null,
            2,
          ),
        },
      },
    ],
    structuredContent: {
      success: true,
      code,
      reported_success: success,
      new_confidence: currentScore,
      total_experiences: experiences.length,
    },
  };
}
