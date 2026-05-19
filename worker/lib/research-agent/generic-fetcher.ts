import { CONFIG } from "../../config";
import { parseHtmlContent } from "./extractor-utils";
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
  if (!response.ok)
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: response.status,
      error: "Fetch Error",
      fetchDurationMs: Date.now() - startTime,
    };
  const html = await response.text();
  if (html.length > CONFIG.MAX_PAYLOAD_SIZE_BYTES) {
    return {
      success: false,
      content: "",
      contentType: "text/html",
      statusCode: 200,
      error: "Content exceeds size limit",
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
