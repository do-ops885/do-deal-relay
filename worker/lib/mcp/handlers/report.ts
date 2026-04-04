import { z } from "zod";
import type { Env } from "../../types";
import type { ToolCallResult } from "../types";
import { getReferralByCode, deactivateReferral } from "../../referral-storage/crud";

export const ReportDealInputSchema = z.object({
  code: z.string().describe("The referral code to report"),
  reason: z.enum(["broken", "expired", "fraudulent", "inaccurate", "duplicate"]).describe("The reason for reporting the deal"),
  comment: z.string().optional().describe("Additional details for the report"),
});

/**
 * Report deal tool handler
 * Allows reporting broken, expired, or fraudulent deals
 */
export async function handleReportDeal(
  args: z.infer<typeof ReportDealInputSchema>,
  env: Env,
): Promise<ToolCallResult> {
  const { code, reason, comment } = args;

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

  // Use deactivateReferral to mark the deal as inactive if reason is strong enough
  // In a real system, some reasons might just flag for review, but for now we deactive
  const result = await deactivateReferral(env, code, reason as any, undefined, comment);

  if (!result) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Failed to report/deactivate referral "${code}".`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `🚩 Deal "${code}" has been reported as ${reason} and deactivated for review.`,
      },
      {
        type: "resource",
        resource: {
          uri: `deals://${code}/report`,
          mimeType: "application/json",
          text: JSON.stringify({
            success: true,
            code,
            reason,
            comment,
            status: "inactive",
            timestamp: new Date().toISOString(),
          }, null, 2),
        },
      },
    ],
    structuredContent: {
      success: true,
      code,
      reason,
      comment,
      status: "inactive",
    },
  };
}
