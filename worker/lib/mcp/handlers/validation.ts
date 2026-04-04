import { z } from "zod";
import type { Env } from "../../../types";
import type { ToolCallResult } from "../types";
import { getReferralByCode } from "../../referral-storage/crud";

export const ValidateDealInputSchema = z.object({
  url: z.string().url().describe("URL to validate"),
  check_status: z.boolean().default(true).describe("Check if deal is active"),
});

/**
 * Validate deal tool handler
 */
export async function handleValidateDeal(
  args: z.infer<typeof ValidateDealInputSchema>,
  env: Env,
): Promise<ToolCallResult> {
  const { url, check_status } = args;

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
    const code = segments[segments.length - 1] || "";

    // Security checks
    const securityCheck = {
      https: parsed.protocol === "https:",
      no_traversal: !url.includes("..") && !url.includes("."),
      has_code: code.length >= 3,
      valid_domain: parsed.hostname.includes("."),
    };

    const isValid = Object.values(securityCheck).every(Boolean);

    // Check status if requested
    let statusCheck = null;
    if (check_status) {
      // Try to find existing referral with this URL
      const codeFromDb = await getReferralByCode(env, code.toUpperCase());
      statusCheck = {
        in_database: !!codeFromDb,
        status: codeFromDb?.status || "unknown",
        last_validated: codeFromDb?.validation?.last_validated || null,
      };
    }

    const result = {
      valid: isValid,
      url: url,
      extracted_code: isValid ? code.toUpperCase() : null,
      domain: parsed.hostname.replace(/^www\./, ""),
      security_check: securityCheck,
      status_check: statusCheck,
    };

    return {
      content: [
        {
          type: "text",
          text: isValid
            ? `✅ URL validation passed for ${parsed.hostname}`
            : `⚠️ URL validation failed - security issues detected`,
        },
        {
          type: "resource",
          resource: {
            uri: `validation://${encodeURIComponent(url)}`,
            mimeType: "application/json",
            text: JSON.stringify(result, null, 2),
          },
        },
      ],
      structuredContent: result,
    };
  } catch {
    return {
      content: [
        {
          type: "text",
          text: "❌ Invalid URL format",
        },
      ],
      isError: true,
    };
  }
}
