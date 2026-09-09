// worker/lib/validation-cache/key.ts

/**
 * Normalizes a URL string by stripping tracking parameters and sorting query parameters.
 *
 * @param input Raw URL string to normalize
 * @returns Clean, canonical URL string
 */
export function normalizeUrl(input: string): string {
  try {
    const url = new URL(input);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();

    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
    ];

    for (const key of trackingParams) {
      url.searchParams.delete(key);
    }

    const sorted = new URL(url.toString());
    // Performance optimization: direct string lexicographical comparison (< and >)
    // is significantly faster than localeCompare and avoids locale-aware collation overhead.
    const entries = [...sorted.searchParams.entries()].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    sorted.search = "";
    for (const [k, v] of entries) sorted.searchParams.append(k, v);

    return sorted.toString();
  } catch {
    return input.toLowerCase().trim();
  }
}

/**
 * Computes the SHA-256 hexadecimal hash string for a given text input.
 *
 * @param input String input to hash
 * @returns 64-character lowercase hexadecimal hash string
 */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Builds a standardized KV cache key for a URL using its normalized SHA-256 hash.
 *
 * @param url URL string to build cache key for
 * @returns Standardized cache key string prefixed with `v:url:`
 */
export async function buildUrlCacheKey(url: string): Promise<string> {
  return `v:url:${await sha256Hex(normalizeUrl(url))}`;
}

/**
 * Builds a standardized KV cache key for a fingerprint string using SHA-256 hash.
 *
 * @param fingerprint Deal fingerprint string
 * @returns Standardized cache key string prefixed with `v:fingerprint:`
 */
export async function buildFingerprintKey(
  fingerprint: string,
): Promise<string> {
  return `v:fingerprint:${await sha256Hex(fingerprint)}`;
}
