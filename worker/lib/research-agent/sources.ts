// Research Source Management
// ============================================================================

import {
  ResearchSource,
  RESEARCH_SOURCES,
  KNOWN_REFERRAL_PROGRAMS,
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
