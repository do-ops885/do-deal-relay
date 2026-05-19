import { FetchResult } from "./fetcher-types";
import { PageContentResult } from "./types";
import { CONFIG } from "../../config";
import { parseHtmlContent } from "./extractor";
import { validateFetchUrl } from "../security";

export async function fetchGenericPageContent(
  url: string,
): Promise<FetchResult & { parsedContent?: PageContentResult }> {
  const startTime = Date.now();
  if (!(await validateFetchUrl(url)))
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 403,
      error: "SSRF Blocked",
      fetchDurationMs: 0,
    };
  const response = await fetch(url, {
    headers: { "User-Agent": CONFIG.USER_AGENT },
    signal: AbortSignal.timeout(10000),
  });
  const html = await response.text();
  if (html.length > CONFIG.MAX_PAYLOAD_SIZE_BYTES) {
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 413,
      error: "Content exceeds size limit after reading",
      fetchDurationMs: Date.now() - startTime,
    };
  }
  return {
    success: true,
    content: html,
    contentType: "text/html",
    statusCode: 200,
    fetchDurationMs: Date.now() - startTime,
    parsedContent: parseHtmlContent(url, html),
  };
}
