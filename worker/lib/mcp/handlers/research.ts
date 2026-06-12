import { z } from "zod";
import type { Env } from "../../../types";
import type { ToolCallResult } from "../types";
import { getReferralsByDomain } from "../../referral-storage/search";
import {
  executeReferralResearch,
  convertResearchToReferrals,
} from "../../research-agent/orchestrator";

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

export async function handleResearchDomain(
  args: z.infer<typeof ResearchDomainInputSchema>,
  env: Env,
): Promise<ToolCallResult> {
  const { domain, depth, max_results } = args;

  const existing = await getReferralsByDomain(env, domain);

  let discovered_codes = existing.slice(0, max_results).map((r) => ({
    code: r.code,
    url: r.url,
    source: r.source || "existing_database",
    discovered_at: r.submitted_at || new Date().toISOString(),
    reward_summary: r.metadata?.reward_value
      ? `${r.metadata.reward_value} ${r.metadata.reward_type || ""}`
      : undefined,
    confidence: r.metadata?.confidence_score || 0.5,
  }));

  let used_real_fetching = false;
  let research_duration_ms = 0;
  let sources_checked: string[] = ["internal_database", "kv_storage"];
  let persisted_count = 0;

  try {
    const researchStart = Date.now();
    const researchResult = await executeReferralResearch(env, {
      query: domain,
      domain,
      depth,
      max_results,
      options: { use_real_fetching: true },
    });
    research_duration_ms = Date.now() - researchStart;
    used_real_fetching = true;
    sources_checked = researchResult.research_metadata.sources_checked;

    if (researchResult.discovered_codes.length > 0) {
      const existingCodes = new Set(existing.map((r) => r.code));
      const newCodes = researchResult.discovered_codes.filter(
        (r) => !existingCodes.has(r.code),
      );

      discovered_codes = [
        ...existing.slice(0, max_results).map((r) => ({
          code: r.code,
          url: r.url,
          source: r.source || "existing_database",
          discovered_at: r.submitted_at || new Date().toISOString(),
          reward_summary: r.metadata?.reward_value
            ? `${r.metadata.reward_value} ${r.metadata.reward_type || ""}`
            : undefined,
          confidence: r.metadata?.confidence_score || 0.5,
        })),
        ...newCodes.slice(0, max_results).map((r) => ({
          code: r.code,
          url: r.url,
          source: r.source,
          discovered_at: r.discovered_at,
          reward_summary: r.reward_summary,
          confidence: r.confidence,
        })),
      ].slice(0, max_results);

      const referrals = await convertResearchToReferrals(env, researchResult);
      persisted_count = referrals.length;
    }
  } catch (error) {
    console.error(
      "MCP Research: real fetching failed",
      domain,
      (error as Error).message,
    );
  }

  const result = {
    query: domain,
    domain,
    discovered_codes,
    research_metadata: {
      sources_checked,
      search_queries: [domain, `${domain} referral`, `${domain} promo`],
      research_duration_ms,
      agent_id: "mcp-server",
      used_real_fetching,
      persisted_count,
    },
  };

  return {
    content: [
      {
        type: "text",
        text: `Research results for "${domain}"\n\nFound ${discovered_codes.length} referral codes${used_real_fetching ? " (real fetching)" : " (database only)"}.${persisted_count > 0 ? ` Persisted ${persisted_count} new referrals.` : ""}`,
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
