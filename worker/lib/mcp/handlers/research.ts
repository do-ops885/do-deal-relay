import { z } from "zod";
import type { Env } from "../../../types";
import type { ToolCallResult } from "../types";
import { getReferralsByDomain } from "../../referral-storage/search";

export const ResearchDomainInputSchema = z.object({
  domain: z.string().describe("Domain to research (e.g., 'dropbox.com')"),
  depth: z
    .enum(["quick", "thorough", "deep"])
    .default("thorough")
    .describe("Research depth"),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum results"),
});

/**
 * Research domain tool handler
 */
export async function handleResearchDomain(
  args: z.infer<typeof ResearchDomainInputSchema>,
  env: Env,
): Promise<ToolCallResult> {
  const { domain, depth, max_results } = args;

  // First check existing referrals for this domain
  const existing = await getReferralsByDomain(env, domain);

  // Build research response
  const discovered_codes = existing.slice(0, max_results).map((r) => ({
    code: r.code,
    url: r.url,
    source: r.source || "existing_database",
    discovered_at: r.submitted_at || new Date().toISOString(),
    reward_summary: r.metadata?.reward_value
      ? `${r.metadata.reward_value} ${r.metadata.reward_type || ""}`
      : undefined,
    confidence: r.metadata?.confidence_score || 0.5,
  }));

  const result = {
    query: domain,
    domain,
    discovered_codes,
    research_metadata: {
      sources_checked: ["internal_database", "kv_storage"],
      search_queries: [domain, `${domain} referral`, `${domain} promo`],
      research_duration_ms: 0,
      agent_id: "mcp-server",
      used_real_fetching: false,
      note: "Research queueing not yet implemented. Showing existing database results.",
    },
  };

  return {
    content: [
      {
        type: "text",
        text: `🔍 Research results for "${domain}"\n\nFound ${discovered_codes.length} existing referral codes in the database.`,
      },
      {
        type: "resource",
        resource: {
          uri: `research://${domain}`,
          mimeType: "application/json",
          text: JSON.stringify(result, null, 2),
        },
      },
    ],
    structuredContent: result,
  };
}
