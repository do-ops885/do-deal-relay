/**
 * URL Redirect Detection
 *
 * Split from url-validator.ts per IMP-6 (LOC hygiene). Re-exported through
 * ./url-validator so existing importers are unchanged.
 */

import { logger } from "../global-logger";
import { CONFIG } from "../../config";
import {
  MAX_REDIRECTS,
  INVALID_STATUS_CODES,
  REDIRECT_STATUS_CODES,
  type UrlValidationResult,
} from "./url-validator-types";
import { resolveUrl } from "./url-request";
import { validatedFetch } from "../security";

export async function detectRedirects(
  url: string,
): Promise<UrlValidationResult> {
  const startTime = Date.now();
  const redirectChain: string[] = [url];
  let currentUrl = url;
  let redirectCount = 0;

  logger.info(`Detecting redirects for: ${url}`, {
    component: "url-validator",
  });

  while (redirectCount <= MAX_REDIRECTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await validatedFetch(currentUrl, {
        method: "HEAD",
        headers: {
          "User-Agent": CONFIG.USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      const location = response.headers.get("location");
      if (location && REDIRECT_STATUS_CODES.includes(response.status)) {
        const nextUrl = resolveUrl(currentUrl, location);

        if (redirectChain.includes(nextUrl)) {
          const responseTime = Date.now() - startTime;
          return {
            url,
            valid: false,
            statusCode: response.status,
            statusText: "Redirect loop detected",
            redirectCount,
            redirectChain,
            finalUrl: currentUrl,
            responseTimeMs: responseTime,
            error: "Redirect loop detected",
            timestamp: new Date().toISOString(),
          };
        }

        redirectChain.push(nextUrl);
        currentUrl = nextUrl;
        redirectCount++;
        continue;
      }

      const responseTime = Date.now() - startTime;

      const isValid =
        response.status >= 200 &&
        response.status < 400 &&
        !INVALID_STATUS_CODES.includes(response.status);

      return {
        url,
        valid: isValid,
        statusCode: response.status,
        statusText: response.statusText,
        redirectCount,
        redirectChain,
        finalUrl: currentUrl,
        responseTimeMs: responseTime,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return {
        url,
        valid: false,
        redirectCount,
        redirectChain,
        finalUrl: currentUrl,
        responseTimeMs: responseTime,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  const responseTime = Date.now() - startTime;
  return {
    url,
    valid: false,
    redirectCount,
    redirectChain,
    finalUrl: currentUrl,
    responseTimeMs: responseTime,
    error: `Exceeded maximum redirects (${MAX_REDIRECTS})`,
    timestamp: new Date().toISOString(),
  };
}
