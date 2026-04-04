import { z } from "zod";
import type { Env, ReferralInput } from "../../types";
import type { ToolCallResult } from "../types";
import {
  getReferralByCode,
  storeReferralInput,
} from "../../referral-storage/crud";

export const GetDealInputSchema = z.object({
  code: z.string().describe("The referral code to look up"),
});

export const AddReferralInputSchema = z.object({
  code: z.string().describe("The referral code"),
  url: z.string().url().describe("Full referral URL"),
  domain: z.string().describe("Domain (e.g., 'example.com')"),
  title: z.string().optional().describe("Title/description of the deal"),
  description: z.string().optional().describe("Detailed description"),
  reward_type: z
    .enum(["cash", "credit", "percent", "item"])
    .default("cash")
    .describe("Type of reward"),
  reward_value: z
    .union([z.string(), z.number()])
    .optional()
    .describe("Reward amount or description"),
  category: z
    .array(z.string())
    .optional()
    .describe("Categories (e.g., ['finance', 'investing'])"),
  expiry_date: z
    .string()
    .datetime()
    .optional()
    .describe("Expiration date in ISO format"),
});

/**
 * Get deal by code tool handler
 */
export async function handleGetDeal(
  args: z.infer<typeof GetDealInputSchema>,
  env: Env,
): Promise<ToolCallResult> {
  const { code } = args;

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

  const result = {
    code: referral.code,
    url: referral.url,
    domain: referral.domain || "unknown",
    title: referral.metadata?.title || referral.description || "Untitled",
    description: referral.description || "",
    status: referral.status || "unknown",
    reward: {
      type: referral.metadata?.reward_type || "unknown",
      value: referral.metadata?.reward_value || null,
    },
    confidence: referral.metadata?.confidence_score || 0.5,
    submitted_at: referral.submitted_at || "unknown",
  };

  return {
    content: [
      {
        type: "text",
        text: `✅ Found referral code "${code}"`,
      },
      {
        type: "resource",
        resource: {
          uri: `deals://${code}`,
          mimeType: "application/json",
          text: JSON.stringify(result, null, 2),
        },
      },
    ],
    structuredContent: result,
  };
}

/**
 * Add referral tool handler
 */
export async function handleAddReferral(
  args: z.infer<typeof AddReferralInputSchema>,
  env: Env,
): Promise<ToolCallResult> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const referral: ReferralInput = {
    id,
    code: args.code,
    url: args.url,
    domain: args.domain,
    description: args.description,
    source: "mcp_agent",
    status: "quarantined",
    submitted_at: now,
    submitted_by: "mcp_agent",
    expires_at: args.expiry_date,
    metadata: {
      title: args.title,
      reward_type: args.reward_type,
      reward_value: args.reward_value,
      category: args.category || ["general"],
      confidence_score: 0.8,
      notes: "Added via MCP protocol",
    },
  };

  await storeReferralInput(env, referral);

  return {
    content: [
      {
        type: "text",
        text: `✅ Referral code "${args.code}" added successfully!\n\nIt has been placed in quarantine for human review before activation.`,
      },
      {
        type: "resource",
        resource: {
          uri: `deals://${id}`,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              success: true,
              id,
              code: args.code,
              status: "quarantined",
              message: "Referral created and queued for review",
            },
            null,
            2,
          ),
        },
      },
    ],
    structuredContent: {
      success: true,
      id,
      code: args.code,
      status: "quarantined",
      message: "Referral created and queued for review",
    },
  };
}
