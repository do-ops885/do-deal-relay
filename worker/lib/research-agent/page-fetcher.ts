import { CONFIG } from "../../config";
import { validateFetchUrl } from "../security";
import type { PageContentResult, MetaTags } from "./types";
import type { FetchResult } from "./fetcher";

export async function fetchGenericPageContent(
  url: string,
): Promise<FetchResult & { parsedContent?: PageContentResult }> {
  const startTime = Date.now();

  if (!(await validateFetchUrl(url))) {
    return {
      success: false,
      content: "",
      contentType: "",
      statusCode: 403,
      error: "Blocked by SSRF protection",
      fetchDurationMs: Date.now() - startTime,
    };
  }

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
    const html = await response.text();

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

function stripScriptAndStyleTags(input: string): string {
  const SCRIPT_BLOCK = /<script\b[^>]*>[\s\S]*?<\/script(?:\s+[^>]*)?>/gi;
  const STYLE_BLOCK = /<style\b[^>]*>[\s\S]*?<\/style(?:\s+[^>]*)?>/gi;
  const parts = input.split(SCRIPT_BLOCK);
  const withoutScript = parts.join("");
  const styleParts = withoutScript.split(STYLE_BLOCK);
  return styleParts.join("");
}

function parseHtmlContent(url: string, html: string): PageContentResult {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1] ? titleMatch[1].trim() : "";

  const metaDescMatch = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
  );
  const description = metaDescMatch?.[1] ? metaDescMatch[1].trim() : "";

  const metaTags: MetaTags = {};
  const metaRegex = /<meta[^>]*>/gi;
  let metaMatch: RegExpExecArray | null = metaRegex.exec(html);
  while (metaMatch !== null) {
    const tag = metaMatch[0];
    if (tag) {
      const nameMatch = tag.match(/name=["']([^"']*)["']/i);
      const contentMatch = tag.match(/content=["']([^"']*)["']/i);
      if (nameMatch?.[1] && contentMatch?.[1]) {
        metaTags[nameMatch[1]] = contentMatch[1];
      }
    }
    metaMatch = metaRegex.exec(html);
  }

  const sanitized = stripScriptAndStyleTags(html);
  let textContent = sanitized.replace(/<[^>]+>/g, " ");
  textContent = textContent.replace(/\s+/g, " ").trim();
  textContent = textContent.substring(0, 10000);

  const links: Array<{ text: string; href: string }> = [];
  const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi;
  let linkMatch: RegExpExecArray | null = linkRegex.exec(sanitized);
  while (linkMatch !== null) {
    const href = linkMatch[1];
    const text = linkMatch[2]?.trim() ?? "";
    if (
      href &&
      !href.match(/^(javascript|data|vbscript):/i) &&
      !href.startsWith("#")
    ) {
      const absoluteUrl = href.startsWith("http")
        ? href
        : new URL(href, url).toString();
      links.push({ text, href: absoluteUrl });
    }
    linkMatch = linkRegex.exec(sanitized);
  }

  return {
    url,
    title,
    description,
    textContent,
    links: links.slice(0, 100),
    metaTags,
  };
}
