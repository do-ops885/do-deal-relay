// Research Agent Scrapers - Barrel Export
// ============================================================================
//
// Centralized re-exports so the orchestrator and tests import from a single
// stable location: worker/lib/research-agent/scrapers.

export {
  type Scraper,
  type ScraperEnv,
  type SourceName,
  type Ai,
  buildFetchError,
  buildFetchSuccess,
  resolveResearchSource,
} from "./base";

export { ProductHuntScraper } from "./producthunt";
export { GitHubScraper } from "./github";
export { HackerNewsScraper } from "./hackernews";
export { RedditScraper } from "./reddit";
export { GenericScraper } from "./generic";
export {
  AIExtractorScraper,
  createAIExtractor,
  type AIExtractOptions,
} from "./ai-extractor";

import type { Scraper, SourceName, ScraperEnv } from "./base";
import { ProductHuntScraper } from "./producthunt";
import { GitHubScraper } from "./github";
import { HackerNewsScraper } from "./hackernews";
import { RedditScraper } from "./reddit";
import { GenericScraper } from "./generic";

/**
 * Build the default registry of scrapers. Order matters only for logging,
 * not for execution (the orchestrator iterates explicitly).
 */
export function createDefaultScraperRegistry(): Map<SourceName, Scraper> {
  return new Map<SourceName, Scraper>([
    ["producthunt", new ProductHuntScraper()],
    ["github", new GitHubScraper()],
    ["hackernews", new HackerNewsScraper()],
    ["reddit", new RedditScraper()],
    ["company_site", new GenericScraper()],
  ]);
}

/**
 * Convenience: identify which sources are READY in the current env.
 * Used in the orchestrator to skip sources that lack credentials.
 */
export function readySourceNames(
  registry: Map<string, Scraper>,
  env: ScraperEnv,
): string[] {
  const ready: string[] = [];
  for (const [name, scraper] of registry.entries()) {
    if (scraper.isReady(env)) ready.push(name);
  }
  return ready;
}
