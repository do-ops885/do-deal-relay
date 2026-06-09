/**
 * Domain rate limiting for URL validation requests.
 */

import { RATE_LIMIT_DELAY_MS } from "./url-validator-types";

const lastRequestTime = new Map<string, number>();

export async function respectRateLimit(domain: string): Promise<void> {
  const lastTime = lastRequestTime.get(domain) || 0;
  const now = Date.now();
  const elapsed = now - lastTime;

  if (elapsed < RATE_LIMIT_DELAY_MS) {
    const delay = RATE_LIMIT_DELAY_MS - elapsed;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  lastRequestTime.set(domain, Date.now());
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}
