import { PageContentResult } from "./types";
import { CONFIG } from "../../config";
import { parseHtmlContent } from "./extractor-logic";
import { validateFetchUrl } from "../security";

export async function fetchGenericPageContent(url: string): Promise<any> {
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
  return {
    success: true,
    content: html,
    contentType: "text/html",
    statusCode: 200,
    fetchDurationMs: Date.now() - startTime,
    parsedContent: parseHtmlContent(url, html),
  };
}
