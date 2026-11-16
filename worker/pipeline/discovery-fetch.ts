/**
 * Discovery Outbound Fetchers
 *
 * Two concerns kept out of `discover.ts` (source size limit):
 *
 * 1. Redirect following — discovery used to send `redirect: "manual"` and
 *    treat every 3xx as a failure, so apex→`www` sources never yielded
 *    content. Each hop re-enters `validatedFetch`, so the trusted-egress
 *    allowlist, DNS/private-IP checks, and Location validation all re-run on
 *    the redirect target.
 * 2. Feature-flag resolution for the AI extractor fallback (fail-closed).
 */

import type { Env } from "../types";
import { CONFIG } from "../config";
import { createTimeoutSignal } from "../lib/utils";
import { validatedFetch } from "../lib/security";
import { isFeatureEnabledWithDefaults } from "../lib/feature-flags";

/** Discovery follows at most this many redirects per pattern. */
export const MAX_DISCOVERY_REDIRECTS = 2;

const DISCOVERY_HEADERS = {
  "User-Agent": "DealDiscoveryBot/1.0 (AI Agent; Autonomous Discovery)",
  Accept: "text/html,application/json",
} as const;

/**
 * Resolve the AI extraction flag once per discovery run. Any feature-flag
 * read problem keeps the (paid, compliance-logged) LLM path off.
 */
export async function isAIExtractionEnabled(env: Env): Promise<boolean> {
  try {
    return await isFeatureEnabledWithDefaults("ai_extractor_scraper", env);
  } catch {
    return false;
  }
}

/**
 * Fetch a URL, following redirects manually. The returned response is the
 * first non-redirect (or the last hop when the limit is reached).
 */
export async function fetchFollowingTrustedRedirects(
  initialUrl: string,
  trustedHosts: ReadonlySet<string>,
): Promise<Response> {
  let currentUrl = initialUrl;

  for (let hop = 0; ; hop++) {
    const { signal, cleanup } = createTimeoutSignal(CONFIG.FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await validatedFetch(
        currentUrl,
        { method: "GET", headers: DISCOVERY_HEADERS, signal },
        trustedHosts,
      );
    } finally {
      cleanup();
    }

    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");
    if (!location || hop >= MAX_DISCOVERY_REDIRECTS) return response;

    currentUrl = new URL(location, currentUrl).toString();
  }
}
