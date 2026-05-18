import { FetchResult } from "./fetcher";
import { PageContentResult } from "./types";
import { CONFIG } from "../../config";
import { parseHtmlContent } from "./extractor";

// Blocked IP ranges for SSRF prevention (private/internal networks)
const BLOCKED_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])/,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
];

/**
 * Validate a URL for SSRF protection.
 * Checks for HTTPS protocol and blocks private/internal IP ranges.
 */
function validateFetchUrl(urlString: string): string | null {
  try {
    const url = new URL(urlString);

    // Only allow HTTP and HTTPS
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "Only HTTP and HTTPS protocols are allowed";
    }

    // Block requests using IP addresses in private/internal ranges
    const hostname = url.hostname;
    if (BLOCKED_IP_RANGES.some((pattern) => pattern.test(hostname))) {
      return "URL points to a private or internal network address";
    }

    // Block requests without a proper hostname
    if (hostname === "localhost" || hostname === "0.0.0.0") {
      return "URL points to localhost";
    }

    return null; // URL is valid
  } catch {
    return "Invalid URL format";
  }
}

/**
 * Fetch content from a generic URL with HTML parsing
 */
export async function fetchGenericPageContent(
  url: string,
): Promise<FetchResult & { parsedContent?: PageContentResult }> {
  const startTime = Date.now();

  try {
    // Validate URL for SSRF protection before fetching
    const urlValidationError = validateFetchUrl(url);
    if (urlValidationError) {
      return {
        success: false,
        content: "",
        contentType: "",
        statusCode: 400,
        error: `URL validation failed: ${urlValidationError}`,
        fetchDurationMs: Date.now() - startTime,
      };
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": CONFIG.USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
      },
      signal: AbortSignal.timeout(CONFIG.RESEARCH_FETCH_TIMEOUT_MS),
    });

    const fetchDurationMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        success: false,
        content: "",
        contentType: response.headers.get("content-type") || "",
        statusCode: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
        fetchDurationMs,
      };
    }

    const contentType = response.headers.get("content-type") || "text/html";

    // Validate Content-Length header before loading the body into memory
    const contentLength = response.headers.get("content-length");
    if (
      contentLength &&
      parseInt(contentLength, 10) > CONFIG.MAX_PAYLOAD_SIZE_BYTES
    ) {
      return {
        success: false,
        content: "",
        contentType,
        statusCode: response.status,
        error: `Content-Length exceeds size limit: ${contentLength} bytes (max: ${CONFIG.MAX_PAYLOAD_SIZE_BYTES})`,
        fetchDurationMs: Date.now() - startTime,
      };
    }

    // HTML scraping: Content size is bounded by CONFIG.MAX_PAYLOAD_SIZE_BYTES check below.
    // Using response.text() is acceptable here as we need the full HTML for parsing.
    const html = await response.text();

    // Validate content size after reading
    if (html.length > CONFIG.MAX_PAYLOAD_SIZE_BYTES) {
      return {
        success: false,
        content: "",
        contentType,
        statusCode: 200,
        error: "Content exceeds size limit after reading",
        fetchDurationMs,
      };
    }

    // Parse HTML to extract relevant content
    const parsed = parseHtmlContent(url, html);

    return {
      success: true,
      content: html,
      contentType,
      statusCode: 200,
      fetchDurationMs,
      parsedContent: parsed,
    };
  } catch (error) {
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 0,
      error: `Fetch error: ${(error as Error).message}`,
      fetchDurationMs: Date.now() - startTime,
    };
  }
}
