// Research Source Management
// ============================================================================

import {
  ResearchSource,
  RESEARCH_SOURCES,
  KNOWN_REFERRAL_PROGRAMS,
  type SourceApiConfig,
} from "./types";

/**
 * Add a new research source
 */
export function addResearchSource(source: ResearchSource): void {
  RESEARCH_SOURCES.push(source);
  // Sort by priority
  RESEARCH_SOURCES.sort((a, b) => a.priority - b.priority);
}

/**
 * Get all available research sources
 */
export function getResearchSources(): ResearchSource[] {
  return [...RESEARCH_SOURCES];
}

/**
 * Get a specific source by name
 */
export function getSourceByName(name: string): ResearchSource | undefined {
  return RESEARCH_SOURCES.find((s) => s.name === name);
}

/**
 * Register a known referral program
 */
export function registerKnownProgram(
  domain: string,
  patterns: {
    patterns: string[];
    urlFormats: string[];
    typicalRewards: string[];
  },
): void {
  KNOWN_REFERRAL_PROGRAMS[domain] = patterns;
}

/**
 * Get API configuration for a source
 */
export function getSourceApiConfig(
  sourceName: string,
): SourceApiConfig | undefined {
  const source = getSourceByName(sourceName);
  return source?.apiConfig;
}

/**
 * Update source API configuration
 */
export function updateSourceApiConfig(
  sourceName: string,
  config: Partial<SourceApiConfig>,
): boolean {
  const source = getSourceByName(sourceName);
  if (!source || !source.apiConfig) {
    return false;
  }

  source.apiConfig = { ...source.apiConfig, ...config };
  return true;
}

/**
 * Get all API-enabled sources
 */
export function getApiEnabledSources(): ResearchSource[] {
  return RESEARCH_SOURCES.filter(
    (s) => s.apiConfig && s.apiConfig.type !== "direct",
  );
}

/**
 * Source API rate limit configuration
 */
export const SOURCE_RATE_LIMITS: {
  [key: string]: {
    requestsPerMinute: number;
    requestsPerHour?: number;
    burstSize?: number;
  };
} = {
  producthunt: {
    requestsPerMinute: 30,
    requestsPerHour: 500,
  },
  github: {
    requestsPerMinute: 30,
    requestsPerHour: 5000,
  },
  hackernews: {
    requestsPerMinute: 100,
  },
  reddit: {
    requestsPerMinute: 60,
    requestsPerHour: 3600,
  },
};

/**
 * Get rate limit for a source
 */
export function getSourceRateLimit(sourceName: string): {
  requestsPerMinute: number;
  requestsPerHour?: number;
  burstSize?: number;
} {
  return SOURCE_RATE_LIMITS[sourceName] || { requestsPerMinute: 60 };
}

/**
 * Authentication environment variable mapping
 */
export const SOURCE_AUTH_ENV_VARS: {
  [key: string]: {
    token?: string;
    clientId?: string;
    clientSecret?: string;
    username?: string;
    password?: string;
  };
} = {
  producthunt: {
    token: "PRODUCTHUNT_API_TOKEN",
  },
  github: {
    token: "GITHUB_API_TOKEN",
  },
  reddit: {
    clientId: "REDDIT_CLIENT_ID",
    clientSecret: "REDDIT_CLIENT_SECRET",
  },
};

/**
 * Get required environment variables for a source
 */
export function getSourceAuthEnvVars(sourceName: string): {
  token?: string;
  clientId?: string;
  clientSecret?: string;
} {
  return SOURCE_AUTH_ENV_VARS[sourceName] || {};
}
