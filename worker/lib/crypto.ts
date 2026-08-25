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
 *
 * @param input - Plaintext string to hash
 * @returns SHA-256 hex digest string
 */
export async function sha256(input: string): Promise<string> {
  const data = ENCODER.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  let result = "";
  for (const byte of hashArray) {
    const hex = HEX_TABLE[byte];
    if (hex) result += hex;
  }
  return result;
}

/**
 * Generate canonical ID for a deal
 * Hash of normalized fields (domain + code + reward type)
 *
 * @param domain - The source domain string
 * @param code - The deal or promo code
 * @param rewardType - The type of reward
 * @returns SHA-256 canonical deal ID string
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
 * Extract a string property from an unknown object without type assertions.
 * Uses Reflect.get() to avoid 'as' casts that Codacy flags as security issues.
 */
function getStringProp(value: unknown, prop: string): string {
  if (typeof value !== "object" || value === null) return "";
  const v = Reflect.get(value, prop);
  return typeof v === "string" ? v : "";
}

/**
 * Generate snapshot hash from deals array
 * Sorts deals by ID to ensure canonical ordering regardless of input order
 *
 * @param deals - Array of deal objects
 * @returns SHA-256 hash of canonically sorted JSON string
 */
export async function generateSnapshotHash(deals: unknown[]): Promise<string> {
  const sorted = [...deals].sort((a, b) => {
    const idA = getStringProp(a, "id");
    const idB = getStringProp(b, "id");
    // Performance optimization: direct string comparison is significantly faster
    // than localeCompare for ID strings (hashes/UUIDs) as it avoids locale-aware collation.
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });
  const serialized = JSON.stringify(sorted);
  return sha256(serialized);
}

/**
 * Generate run ID from timestamp
 * Format: deals-YYYY-MM-DD-HH
 *
 * @param date - Optional Date object (defaults to current time)
 * @returns Formatted run ID string
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
 *
 * @returns Randomly generated RFC4122 v4 UUID string
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Combined check, lowercase, and index calculation for alphanumeric characters (0-35).
 * a-z: 0-25, 0-9: 26-35. Returns -1 if not alphanumeric.
 * Optimization: reduces branching and range checks in hot loops.
 */
function getAlphanumericIndex(code: number): number {
  if (code >= 97 && code <= 122) return code - 97; // a-z
  if (code >= 48 && code <= 57) return code - 48 + 26; // 0-9
  if (code >= 65 && code <= 90) return code - 65; // A-Z (map to 0-25)
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
 *
 * @param a - First string
 * @param b - Second string
 * @returns True if normalized alphanumeric characters are equal
 */
export function normalizedEquals(a: string, b: string): boolean {
  let i = 0;
  let j = 0;

  while (i < a.length || j < b.length) {
    let idxA = -1;
    while (i < a.length) {
      idxA = getAlphanumericIndex(a.charCodeAt(i));
      if (idxA !== -1) break;
      i++;
    }

    let idxB = -1;
    while (j < b.length) {
      idxB = getAlphanumericIndex(b.charCodeAt(j));
      if (idxB !== -1) break;
      j++;
    }

    if (i === a.length || j === b.length) {
      return i === a.length && j === b.length;
    }

    if (idxA !== idxB) {
      return false;
    }

    i++;
    j++;
  }

  return true;
}

export interface BigramBitset {
  bits: Uint32Array;
  count: number;
}

/**
 * Extracts character bigrams into a bitset for Jaccard similarity.
 * 36 characters (a-z0-9) -\> 36*36 = 1296 possible bigrams.
 * 1296 bits / 32 = 40.5 words. 41 words total.
 *
 * @param s - Input string
 * @returns BigramBitset object containing word array and non-zero bit count
 */
export function getBigramBitset(s: string): BigramBitset {
  const bits = new Uint32Array(41);
  let prevIdx = -1;
  let count = 0;

  for (let i = 0; i < s.length; i++) {
    const idx = getAlphanumericIndex(s.charCodeAt(i));
    if (idx !== -1) {
      if (prevIdx !== -1) {
        const bitIdx = prevIdx * 36 + idx;
        const word = bitIdx >>> 5;
        const bit = 1 << (bitIdx & 31);
        const currentWord = bits[word] ?? 0;
        if (!(currentWord & bit)) {
          bits[word] = currentWord | bit;
          count++;
        }
      }
      prevIdx = idx;
    }
  }
  return { bits, count };
}

/**
 * Calculate similarity between two precomputed string bigrams (0-1).
 * Avoids any dynamic allocations or string parsing.
 *
 * @param resA - First precomputed bigram bitset
 * @param resB - Second precomputed bigram bitset
 * @returns Jaccard similarity score between 0.0 and 1.0
 */
export function calculateStringSimilarityPrecomputed(
  resA: BigramBitset,
  resB: BigramBitset,
): number {
  if (resA.count === 0 || resB.count === 0) return 0.0;

  let intersectionSize = 0;
  for (let i = 0; i < 41; i++) {
    const common = (resA.bits[i] ?? 0) & (resB.bits[i] ?? 0);
    if (common) {
      intersectionSize += popcount(common);
    }
  }

  const unionSize = resA.count + resB.count - intersectionSize;
  return intersectionSize / unionSize;
}

/**
 * Calculate similarity between two strings (0-1)
 * Uses Jaccard similarity on character bigrams with zero-allocation bitset normalization.
 * Optimized to avoid Set/Map allocations by using a fixed-size bitset for 36x36 bigrams.
 *
 * @param a - First string
 * @param b - Second string
 * @returns Jaccard similarity score between 0.0 and 1.0
 */
export function calculateStringSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (normalizedEquals(a, b)) return 1.0;

  const resA = getBigramBitset(a);
  const resB = getBigramBitset(b);

  return calculateStringSimilarityPrecomputed(resA, resB);
}

/**
 * Encode a string or Uint8Array to base64url format.
 * Uses a chunked approach to convert bytes to a binary string to avoid
 * the O(N^2) overhead of repeated string concatenation while remaining
 * compatible with the standard btoa() function which expects 0-255 range.
 *
 * @param input - String or Uint8Array payload to encode
 * @returns URL-safe base64 string
 */
export function base64urlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? ENCODER.encode(input) : input;

  // Use a chunked approach to build the binary string efficiently.
  // String.fromCharCode(...chunk) is much faster than byte-by-byte concatenation.
  const CHUNK_SIZE = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    // @ts-expect-error - apply is fine with Uint8Array
    binary += String.fromCharCode.apply(null, chunk);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface PrecomputedUrlSimilarityData {
  hostname: string;
  pathname: string;
  search: string;
  pathBigrams: BigramBitset;
  searchBigrams: BigramBitset;
  rawUrlString: string;
  isMalformed: boolean;
}

/**
 * Precomputes URL similarity fields once to avoid O(N^2) parsing/allocation overhead in hot loops.
 *
 * @param urlInput - String or URL instance
 * @returns Structured PrecomputedUrlSimilarityData object
 */
export function precomputeUrlSimilarityData(
  urlInput: string | URL,
): PrecomputedUrlSimilarityData {
  try {
    const parsed = typeof urlInput === "string" ? new URL(urlInput) : urlInput;
    const pathname = parsed.pathname;
    const search = parsed.search;
    return {
      hostname: parsed.hostname,
      pathname,
      search,
      pathBigrams: getBigramBitset(pathname),
      searchBigrams: getBigramBitset(search),
      rawUrlString:
        typeof urlInput === "string" ? urlInput : urlInput.toString(),
      isMalformed: false,
    };
  } catch {
    const rawUrlString =
      typeof urlInput === "string" ? urlInput : urlInput.toString();
    return {
      hostname: "",
      pathname: rawUrlString,
      search: "",
      pathBigrams: getBigramBitset(rawUrlString),
      searchBigrams: { bits: new Uint32Array(41), count: 0 },
      rawUrlString,
      isMalformed: true,
    };
  }
}

/**
 * Calculates similarity between two precomputed URL structures without string-scanning/allocation overhead.
 *
 * @param a - First precomputed URL data structure
 * @param b - Second precomputed URL data structure
 * @returns Weighted URL similarity score between 0.0 and 1.0
 */
export function calculateUrlSimilarityPrecomputed(
  a: PrecomputedUrlSimilarityData,
  b: PrecomputedUrlSimilarityData,
): number {
  if (a.isMalformed || b.isMalformed) {
    if (a.rawUrlString === b.rawUrlString) return 1.0;
    if (normalizedEquals(a.rawUrlString, b.rawUrlString)) return 1.0;
    return calculateStringSimilarityPrecomputed(a.pathBigrams, b.pathBigrams);
  }

  // Same domain is prerequisite
  if (a.hostname !== b.hostname) {
    return 0.0;
  }

  // Compare paths
  let pathSim: number;
  if (a.pathname === b.pathname) {
    pathSim = 1.0;
  } else if (normalizedEquals(a.pathname, b.pathname)) {
    pathSim = 1.0;
  } else {
    pathSim = calculateStringSimilarityPrecomputed(
      a.pathBigrams,
      b.pathBigrams,
    );
  }

  // Compare query parameters (if present)
  let paramsSim: number;
  if (!a.search && !b.search) {
    paramsSim = 1.0;
  } else if (a.search === b.search) {
    paramsSim = 1.0;
  } else if (normalizedEquals(a.search, b.search)) {
    paramsSim = 1.0;
  } else {
    paramsSim = calculateStringSimilarityPrecomputed(
      a.searchBigrams,
      b.searchBigrams,
    );
  }

  // Weighted average: path matters more
  return pathSim * 0.7 + paramsSim * 0.3;
}

/**
 * Calculate URL similarity (for semantic deduplication)
 *
 * @param urlA - First URL string or object
 * @param urlB - Second URL string or object
 * @returns Weighted URL similarity score between 0.0 and 1.0
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
    // Optimization: use raw search string instead of re-serializing params.
    // Skip slice(1) as leading '?' is ignored by similarity normalization.
    const paramsA = parsedA.search;
    const paramsB = parsedB.search;
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
