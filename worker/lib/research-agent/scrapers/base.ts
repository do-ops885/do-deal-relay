// Research Agent Scrapers - Base Interface
// ============================================================================
//
// Defines the canonical Scraper interface that wraps our existing real-world
// fetchers (ProductHunt, GitHub, HackerNews, Reddit, generic HTML) in a clean
// surface. The orchestrator dispatches through this interface so that adding
// a new source is a one-file change.
//
// Existing real fetchers reused:
//   - worker/lib/research-agent/api-fetchers.ts
//   - worker/lib/research-agent/reddit-fetcher.ts
//   - worker/lib/research-agent/page-fetcher.ts
//
// New in this module:
//   - scrapers/ai-extractor.ts (Workers AI LLM extraction)

import type { FetchResult, ResearchSource } from "../types";

// Reuse the existing FetchResult type so the rest of the pipeline stays DRY
export type { FetchResult };

export type SourceName =
  | "producthunt"
  | "github"
  | "hackernews"
  | "reddit"
  | "company_site"
  | "ai_extractor";

/**
 * Common interface every source-specific scraper must satisfy.
 * Existing modules already return FetchResult — this interface lets us
 * compose them through a uniform dispatch layer.
 */
export interface Scraper {
  readonly name: SourceName;
  /** True if the scraper has all credentials/dependencies it needs. */
  isReady(env: ScraperEnv): boolean;
  /** Perform the actual scrape for `query`. */
  scrape(env: ScraperEnv, query: string, limit?: number): Promise<FetchResult>;
}

/**
 * Minimal subset of Env that scrapers read. Keeping this tight lets us reuse
 * the same Scraper in unit tests with synthetic env objects.
 */
export interface ScraperEnv {
  PRODUCTHUNT_API_TOKEN?: string;
  GITHUB_API_TOKEN?: string;
  REDDIT_CLIENT_ID?: string;
  REDDIT_CLIENT_SECRET?: string;
  AI?: Ai;
}

/**
 * Cloudflare Workers AI binding shape (re-declared locally to avoid pulling
 * in the @cloudflare/workers-types in unrelated source files).
 */
export interface Ai {
  run(
    model: string,
    input: unknown,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
}

/**
 * Helper that builds a FetchResult for VALIDATION failures (auth/SSRF/etc.)
 * without re-allocating timestamps. Keeps every scraper return shape uniform.
 */
export function buildFetchError(
  statusCode: number,
  error: string,
  startTime: number,
): FetchResult {
  return {
    success: false,
    content: "",
    contentType: "",
    statusCode,
    error,
    fetchDurationMs: Date.now() - startTime,
  };
}

/**
 * Helper that wraps a successful result with the standard shape.
 */
export function buildFetchSuccess(
  content: string,
  contentType: string,
  startTime: number,
): FetchResult {
  return {
    success: true,
    content,
    contentType,
    statusCode: 200,
    fetchDurationMs: Date.now() - startTime,
  };
}

/**
 * Maps a source name to its ResearchSource descriptor when one exists.
 * Used by the orchestrator to look up extractors and rate limits.
 */
export function resolveResearchSource(
  name: SourceName,
  sources: ResearchSource[],
): ResearchSource | undefined {
  return sources.find((s) => s.name === name);
}
