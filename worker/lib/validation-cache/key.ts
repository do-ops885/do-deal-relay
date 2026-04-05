// worker/lib/validation-cache/key.ts

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
    const entries = [...sorted.searchParams.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );
    sorted.search = "";
    for (const [k, v] of entries) sorted.searchParams.append(k, v);

    return sorted.toString();
  } catch {
    return input.toLowerCase().trim();
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildUrlCacheKey(url: string): Promise<string> {
  return `v:url:${await sha256Hex(normalizeUrl(url))}`;
}

export async function buildFingerprintKey(
  fingerprint: string,
): Promise<string> {
  return `v:fingerprint:${await sha256Hex(fingerprint)}`;
}
