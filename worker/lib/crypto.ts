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
 * Get index for alphanumeric character (0-35) for bitset mapping
 */
function getCharIndex(code: number): number {
  if (code >= 97 && code <= 122) return code - 97; // a-z: 0-25
  if (code >= 48 && code <= 57) return code - 48 + 26; // 0-9: 26-35
  return -1;
}

/**
 * Fast bitwise popcount for 32-bit integers
 */
function popcount(v: number): number {
  v = v - ((v >> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
  return (((v + (v >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
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
 * Uses Jaccard similarity on character bigrams with zero-allocation bitset normalization.
 * Optimized to avoid Set/Map allocations by using a fixed-size bitset for 36x36 bigrams.
 */
export function calculateStringSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (normalizedEquals(a, b)) return 1.0;

  const getBigramBitset = (s: string) => {
    // 36 characters (a-z0-9) -> 36*36 = 1296 possible bigrams.
    // 1296 bits / 32 = 40.5 words. 41 words total.
    const bits = new Uint32Array(41);
    let prevIdx = -1;
    let count = 0;

    for (let i = 0; i < s.length; i++) {
      const rawCode = s.charCodeAt(i);
      if (isAlphanumeric(rawCode)) {
        const idx = getCharIndex(toLowerCode(rawCode));
        if (prevIdx !== -1) {
          const bitIdx = prevIdx * 36 + idx;
          const word = bitIdx >>> 5;
          const bit = 1 << (bitIdx & 31);
          const currentWord = bits[word];
          if (currentWord !== undefined && !(currentWord & bit)) {
            bits[word] = currentWord | bit;
            count++;
          }
        }
        prevIdx = idx;
      }
    }
    return { bits, count };
  };

  const resA = getBigramBitset(a);
  const resB = getBigramBitset(b);

  if (resA.count === 0 || resB.count === 0) return 0.0;

  let intersectionSize = 0;
  for (let i = 0; i < 41; i++) {
    const aVal = resA.bits[i];
    const bVal = resB.bits[i];
    if (aVal === undefined || bVal === undefined) continue;
    const common = aVal & bVal;
    if (common) {
      intersectionSize += popcount(common);
    }
  }

  const unionSize = resA.count + resB.count - intersectionSize;
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
    // Optimization: use raw search string instead of re-serializing params
    const paramsA = parsedA.search ? parsedA.search.slice(1) : "";
    const paramsB = parsedB.search ? parsedB.search.slice(1) : "";
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
