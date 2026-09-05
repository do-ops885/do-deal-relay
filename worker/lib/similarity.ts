/**
 * Shared helpers for deal similarity scoring.
 *
 * Normalizes category/tag terms once per set so scoring reuses lowercased
 * values instead of lowercasing inside nested per-term loops.
 */

export const CATEGORY_MATCH_WEIGHT = 3;
export const DOMAIN_MATCH_WEIGHT = 2;
export const TAG_MATCH_WEIGHT = 1;

const INITIAL_OVERLAP_COUNT = 0;
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
  let overlap = INITIAL_OVERLAP_COUNT;
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
