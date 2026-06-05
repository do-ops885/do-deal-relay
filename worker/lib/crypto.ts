// ============================================================================
// Cryptographic Utilities
// ============================================================================

const ENCODER = new TextEncoder();
const HEX_TABLE = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, "0"),
);

/**
 * Generate SHA-256 hash of input string
 * Optimized with shared TextEncoder and hex lookup table
 */
export async function sha256(input: string): Promise<string> {
  const data = ENCODER.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  let result = "";
  for (let i = 0; i < hashArray.length; i++) {
    const hex = HEX_TABLE[hashArray[i]!];
    if (hex) result += hex;
  }
  return result;
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
 * Efficiently check if a character code is alphanumeric
 */
function isAlphanumeric(code: number): boolean {
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) // a-z
  );
}

/**
 * Efficiently lowercase a character code if it's uppercase
 */
function toLowerCode(code: number): number {
  return code >= 65 && code <= 90 ? code + 32 : code;
}

/**
 * Compare two strings for equality after normalization without allocations
 */
export function normalizedEquals(a: string, b: string): boolean {
  let i = 0;
  let j = 0;

  while (i < a.length || j < b.length) {
    // Find next alphanumeric in A
    while (i < a.length && !isAlphanumeric(a.charCodeAt(i))) i++;
    // Find next alphanumeric in B
    while (j < b.length && !isAlphanumeric(b.charCodeAt(j))) j++;

    if (i === a.length || j === b.length) {
      return i === a.length && j === b.length;
    }

    if (toLowerCode(a.charCodeAt(i)) !== toLowerCode(b.charCodeAt(j))) {
      return false;
    }

    i++;
    j++;
  }

  return true;
}

/**
 * Calculate similarity between two strings (0-1)
 * Uses Jaccard similarity on character bigrams with zero-allocation normalization
 */
export function calculateStringSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (normalizedEquals(a, b)) return 1.0;

  const getBigrams = (s: string): Set<number> => {
    const bigrams = new Set<number>();
    let prevCode = -1;

    for (let i = 0; i < s.length; i++) {
      const rawCode = s.charCodeAt(i);
      if (isAlphanumeric(rawCode)) {
        const code = toLowerCode(rawCode);
        if (prevCode !== -1) {
          // Pack two characters into a single number to avoid string allocations
          bigrams.add((prevCode << 16) | code);
        }
        prevCode = code;
      }
    }
    return bigrams;
  };

  const setA = getBigrams(a);
  const setB = getBigrams(b);

  if (setA.size === 0 || setB.size === 0) return 0.0;

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
 * Encode a string or Uint8Array to base64url format
 */
export function base64urlEncode(input: string | Uint8Array): string {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = ENCODER.encode(input);
  } else {
    bytes = input;
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Calculate URL similarity (for semantic deduplication)
 */
export function calculateUrlSimilarity(
  urlA: string | URL,
  urlB: string | URL,
): number {
  try {
    const parsedA = typeof urlA === "string" ? new URL(urlA) : urlA;
    const parsedB = typeof urlB === "string" ? new URL(urlB) : urlB;

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
    return calculateStringSimilarity(
      typeof urlA === "string" ? urlA : urlA.toString(),
      typeof urlB === "string" ? urlB : urlB.toString(),
    );
  }
}
