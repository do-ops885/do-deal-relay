// ============================================================================
// Cryptographic Utilities
// ============================================================================

/**
 * Generate SHA-256 hash of input string
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate canonical ID for a deal
 * Hash of normalized fields (domain + code + reward type)
 */
export async function generateDealId(
  domain: string,
  code: string,
  rewardType: string,
): Promise<string> {
  const normalized = `${domain.toLowerCase().trim()}:${code.toLowerCase().trim()}:${rewardType}`;
  return sha256(normalized);
}

/**
 * Generate snapshot hash from deals array
 * Sorts deals by ID to ensure canonical ordering regardless of input order
 */
export async function generateSnapshotHash(deals: unknown[]): Promise<string> {
  const sorted = [...deals].sort((a, b) => {
    const idA = (a as Record<string, unknown>).id as string;
    const idB = (b as Record<string, unknown>).id as string;
    return (idA || "").localeCompare(idB || "");
  });
  const serialized = JSON.stringify(sorted);
  return sha256(serialized);
}

/**
 * Generate run ID from timestamp
 * Format: deals-YYYY-MM-DD-HH
 */
export function generateRunId(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  return `deals-${year}-${month}-${day}-${hour}`;
}

/**
 * Generate UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Calculate similarity between two strings (0-1)
 * Uses Jaccard similarity on character bigrams
 */
export function calculateStringSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const strA = normalize(a);
  const strB = normalize(b);

  if (strA === strB) return 1.0;
  if (strA.length < 2 || strB.length < 2) return 0.0;

  const getBigrams = (s: string): Set<string> => {
    const bigrams = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      bigrams.add(s.slice(i, i + 2));
    }
    return bigrams;
  };

  const setA = getBigrams(strA);
  const setB = getBigrams(strB);

  // Performance optimization: Calculate intersection size directly to avoid additional Set/Array allocations
  // Uses the Inclusion-Exclusion Principle: |A ∪ B| = |A| + |B| - |A ∩ B|
  let intersectionSize = 0;
  const [smaller, larger] = setA.size < setB.size ? [setA, setB] : [setB, setA];
  for (const item of smaller) {
    if (larger.has(item)) {
      intersectionSize++;
    }
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return intersectionSize / unionSize;
}

/**
 * Calculate URL similarity (for semantic deduplication)
 */
export function calculateUrlSimilarity(urlA: string, urlB: string): number {
  try {
    const parsedA = new URL(urlA);
    const parsedB = new URL(urlB);

    // Same domain is prerequisite
    if (parsedA.hostname !== parsedB.hostname) {
      return 0.0;
    }

    // Compare paths
    const pathSim = calculateStringSimilarity(
      parsedA.pathname,
      parsedB.pathname,
    );

    // Compare query parameters (if present)
    const paramsA = parsedA.searchParams.toString();
    const paramsB = parsedB.searchParams.toString();
    const paramsSim =
      paramsA || paramsB ? calculateStringSimilarity(paramsA, paramsB) : 1.0;

    // Weighted average: path matters more
    return pathSim * 0.7 + paramsSim * 0.3;
  } catch {
    return calculateStringSimilarity(urlA, urlB);
  }
}
