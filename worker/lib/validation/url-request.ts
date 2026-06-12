/**
 * Low-level HTTP request helpers for URL validation.
 */

import { VALIDATION_TIMEOUT_MS } from "./url-validator-types";
import { CONFIG } from "../../config";

export async function tryHeadRequest(url: string): Promise<{
  success: boolean;
  statusCode?: number;
  statusText?: string;
  location?: string;
  error?: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
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

    return {
      success: true,
      statusCode: response.status,
      statusText: response.statusText,
      location: response.headers.get("location") || undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "HEAD request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function tryGetRequest(url: string): Promise<{
  success: boolean;
  statusCode?: number;
  statusText?: string;
  error?: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
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

    return {
      success: true,
      statusCode: response.status,
      statusText: response.statusText,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "GET request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveUrl(base: string, relative: string): string {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}
