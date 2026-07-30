import type { Env } from "../../types";
import { isFeatureEnabled } from "../feature-flags";
import { getSourceRateLimit } from "../research-agent/sources";
import { RESEARCH_SOURCES } from "../research-agent/constants";

// ============================================================================
// Research Agent Capability Status (NEW-FEAT-1: ADR-020 Phase 1)
// ============================================================================

export interface ResearchCapabilityStatus {
  featureFlagEnabled: boolean;
  environment: string;
  realFetchingEnabled: boolean;
  configuredSources: number;
  sources: ResearchSourceStatus[];
  apiKeysConfigured: string[];
}

export interface ResearchSourceStatus {
  name: string;
  hasApiConfig: boolean;
  apiKeyConfigured: boolean;
  rateLimit: { requestsPerMinute: number } | null;
  status: "ready" | "needs_api_key" | "rate_limited" | "inactive";
}

/**
 * Get the current capability status of the research agent.
 * Reports which sources are configured for real fetching vs simulation.
 */
export async function getResearchCapabilityStatus(
  env: Env,
): Promise<ResearchCapabilityStatus> {
  const featureFlagEnabled = await isFeatureEnabled(
    "real_research_fetching",
    env,
  );

  // Check which API keys are configured
  const apiKeysConfigured: string[] = [];
  const checkKey = (key: string | undefined, name: string) => {
    if (key && key.length > 0) apiKeysConfigured.push(name);
  };
  checkKey(
    (env as { PRODUCTHUNT_API_TOKEN?: string }).PRODUCTHUNT_API_TOKEN,
    "PRODUCTHUNT_API_TOKEN",
  );
  checkKey(
    (env as { GITHUB_API_TOKEN?: string }).GITHUB_API_TOKEN,
    "GITHUB_API_TOKEN",
  );
  checkKey(
    (env as { REDDIT_CLIENT_ID?: string }).REDDIT_CLIENT_ID,
    "REDDIT_CLIENT_ID",
  );
  checkKey(
    (env as { REDDIT_CLIENT_SECRET?: string }).REDDIT_CLIENT_SECRET,
    "REDDIT_CLIENT_SECRET",
  );

  const realFetchingEnabled =
    featureFlagEnabled &&
    (env.ENVIRONMENT === "production" ||
      env.RESEARCH_USE_REAL_FETCHING === "true" ||
      apiKeysConfigured.length > 0);

  const sources: ResearchSourceStatus[] = RESEARCH_SOURCES.map((source) => {
    const rateLimit = getSourceRateLimit(source.name);
    const hasApiConfig = Boolean(source.apiConfig);
    const apiKeyConfigured = hasApiConfig && apiKeysConfigured.length > 0;

    let status: ResearchSourceStatus["status"] = "inactive";
    if (hasApiConfig) {
      if (apiKeyConfigured) {
        status = "ready";
      } else {
        status = "needs_api_key";
      }
    } else if (source.name === "company_site") {
      // Company site doesn't need API keys (uses generic scraping)
      status = "ready";
    }

    return {
      name: source.name,
      hasApiConfig,
      apiKeyConfigured,
      rateLimit: rateLimit
        ? {
            requestsPerMinute: rateLimit.requestsPerMinute,
          }
        : null,
      status,
    };
  });

  return {
    featureFlagEnabled,
    environment: env.ENVIRONMENT || "unknown",
    realFetchingEnabled,
    configuredSources: sources.filter((s) => s.status === "ready").length,
    sources,
    apiKeysConfigured,
  };
}
