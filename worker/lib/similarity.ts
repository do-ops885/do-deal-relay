/**
 * Shared helpers for deal similarity scoring.
 *
 * Normalizes category/tag terms once per set so scoring reuses lowercased
 * values instead of lowercasing inside nested per-term loops.
 */

export const CATEGORY_MATCH_WEIGHT = 3;
export const DOMAIN_MATCH_WEIGHT = 2;
export const TAG_MATCH_WEIGHT = 1;

const SINGLE_MATCH_INCREMENT = 1;
const EMPTY_TERM_LENGTH = 0;

/**
 * Normalize an unknown value into a set of unique lowercased terms.
 * Lowercases once per entry, trims whitespace, skips non-strings and empties.
 *
 * @param values - Candidate category/tag list of unknown shape
 * @returns Set of unique lowercased terms
 */
export function normalizeTerms(values: unknown): Set<string> {
  const normalized = new Set<string>();
  if (Array.isArray(values)) {
    for (const entry of values) {
      if (typeof entry === "string") {
        const term = entry.trim().toLowerCase();
        if (term.length === EMPTY_TERM_LENGTH) {
          continue;
        }
        normalized.add(term);
      }
    }
  }
  return normalized;
}

/**
 * Count how many unique target terms appear in the candidate set.
 * Each target term counts at most once because inputs are sets.
 *
 * @param target - Normalized target terms
 * @param candidate - Normalized candidate (deal) terms
 * @returns Number of shared terms
 */
export function countOverlap(
  target: Set<string>,
  candidate: Set<string>,
): number {
  let overlap = 0;
  const targetIsSmaller = target.size <= candidate.size;
  const smaller = targetIsSmaller ? target : candidate;
  const larger = targetIsSmaller ? candidate : target;
  for (const term of smaller) {
    if (larger.has(term)) {
      overlap += SINGLE_MATCH_INCREMENT;
    }
  }
  return overlap;
}

/**
 * Minimal candidate shape needed for similarity scoring.
 * Full Deal objects satisfy this structurally; tests can pass lightweight
 * mocks without building every Deal field.
 */
export interface SimilarDealCandidate {
  metadata: {
    category: unknown;
    tags: unknown;
  };
  source: {
    domain: string;
  };
}

/**
 * Score a candidate deal against pre-normalized target sets with split
 * field semantics: category-vs-category, domain, tag-vs-tag.
 * Category and tag sets stay separate so a tag matching a target category
 * (or vice versa) contributes nothing for that weight.
 * Code similarity is intentionally excluded; callers add it when present.
 *
 * @param targetCategories - Normalized target category terms
 * @param targetTags - Normalized target tag terms
 * @param targetDomain - Target domain (compared case-insensitively)
 * @param deal - Candidate deal with raw category/tags and source domain
 * @returns Split similarity score without code similarity
 */
export function scoreSimilarDeal(
  targetCategories: Set<string>,
  targetTags: Set<string>,
  targetDomain: string,
  deal: SimilarDealCandidate,
): number {
  const dealCategories = normalizeTerms(deal.metadata.category);
  const dealTags = normalizeTerms(deal.metadata.tags);
  let score = 0;
  score +=
    countOverlap(targetCategories, dealCategories) * CATEGORY_MATCH_WEIGHT;
  if (deal.source.domain.toLowerCase() === targetDomain.toLowerCase()) {
    score += DOMAIN_MATCH_WEIGHT;
  }
  score += countOverlap(targetTags, dealTags) * TAG_MATCH_WEIGHT;
  return score;
}
