import type { Env } from "../../types";
import { isFeatureEnabled } from "../feature-flags";
import {
  getSourceRateLimit,
  SOURCE_AUTH_ENV_VARS,
} from "../research-agent/sources";
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
    featureFlagEnabled || env.RESEARCH_USE_REAL_FETCHING === "true";

  const sources: ResearchSourceStatus[] = RESEARCH_SOURCES.map((source) => {
    const rateLimit = getSourceRateLimit(source.name);
    const hasApiConfig = Boolean(source.apiConfig);
    const requiresApiKey =
      hasApiConfig && source.apiConfig?.authType !== "none";
    const apiKeyConfigured =
      hasApiConfig && (!requiresApiKey || hasSourceApiKey(source.name, env));

    let status: ResearchSourceStatus["status"] = "inactive";
    if (hasApiConfig && source.baseUrl) {
      status = apiKeyConfigured ? "ready" : "needs_api_key";
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

function hasSourceApiKey(sourceName: string, env: Env): boolean {
  const auth = SOURCE_AUTH_ENV_VARS[sourceName];
  if (!auth) return false;

  if (auth.token) {
    return Boolean((env as unknown as Record<string, unknown>)[auth.token]);
  }

  if (auth.clientId && auth.clientSecret) {
    return Boolean(
      (env as unknown as Record<string, unknown>)[auth.clientId] &&
      (env as unknown as Record<string, unknown>)[auth.clientSecret],
    );
  }

  return false;
}
