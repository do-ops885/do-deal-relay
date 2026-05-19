import { Env, ReferralResearchResult } from "../../types";

export function getApiKeys(env: Env) {
  // Use indexed access to bypass strict Env typing if needed,
  // though Env should have these if it matches types.ts
  const e = env as any;
  return {
    productHuntToken: e.PRODUCTHUNT_TOKEN || e.PRODUCTHUNT_API_TOKEN,
    githubToken: e.GITHUB_TOKEN || e.GITHUB_API_TOKEN,
    redditClientId: e.REDDIT_CLIENT_ID,
    redditClientSecret: e.REDDIT_CLIENT_SECRET,
  };
}

const researchCache = new Map<string, { results: ReferralResearchResult["discovered_codes"]; expiry: number }>();

export function getCachedResults(query: string, source: string): ReferralResearchResult["discovered_codes"] | null {
  const key = `${source}:${query}`;
  const cached = researchCache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return cached.results;
  }
  return null;
}

export function cacheResults(query: string, source: string, results: ReferralResearchResult["discovered_codes"]): void {
  const key = `${source}:${query}`;
  researchCache.set(key, {
    results,
    expiry: Date.now() + 3600000,
  });
}

const circuitState = new Map<string, { failures: number; lastFailure: number; open: boolean }>();

export function isCircuitOpen(source: string): boolean {
  const state = circuitState.get(source);
  if (!state || !state.open) return false;
  if (Date.now() - state.lastFailure > 300000) {
    state.open = false;
    state.failures = 0;
    return false;
  }
  return true;
}

export function recordSuccess(source: string): void {
  circuitState.set(source, { failures: 0, lastFailure: 0, open: false });
}

export function recordFailure(source: string): void {
  const state = circuitState.get(source) || { failures: 0, lastFailure: 0, open: false };
  state.failures++;
  state.lastFailure = Date.now();
  if (state.failures >= 5) {
    state.open = true;
  }
  circuitState.set(source, state);
}
