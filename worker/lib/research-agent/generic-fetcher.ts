import { FetchResult } from "./fetcher";
import { PageContentResult } from "./types";
import { CONFIG } from "../../config";
import { parseHtmlContent } from "./extractor";

/**
 * Fetch content from a generic URL with HTML parsing
 */
export async function fetchGenericPageContent(
  url: string,
): Promise<FetchResult & { parsedContent?: PageContentResult }> {
  const startTime = Date.now();

  try {
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
    // to avoid buffering excessive data. If the header is missing, we
    // proceed cautiously and check the actual size after reading.
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

    const html = await response.text();

    // Validate content size after reading (fallback for missing Content-Length)
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
