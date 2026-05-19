import { PageContentResult, MetaTags } from "./types";

export function parseHtmlContent(url: string, html: string): PageContentResult {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1]?.trim() || "";
  const metaDescMatch = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
  );
  const description = metaDescMatch?.[1]?.trim() || "";
  const metaTags: MetaTags = {};
  const metaRegex = /<meta[^>]*>/gi;
  let metaMatch;
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    const tag = metaMatch[0];
    if (!tag) continue;
    const nameMatch = tag.match(/name=["']([^"']*)["']/i);
    const contentMatch = tag.match(/content=["']([^"']*)["']/i);
    if (nameMatch?.[1] && contentMatch?.[1])
      metaTags[nameMatch[1]] = contentMatch[1];
  }
  let textContent = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script(?:\s+[^>]*)?\s*>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style(?:\s+[^>]*)?\s*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    url,
    title,
    description,
    textContent: textContent.substring(0, 10000),
    links: [],
    metaTags,
  };
}

export interface ExtractedReferral {
  code: string;
  url: string;
  source: string;
  discoveredAt: string;
  rewardSummary?: string;
  confidence: number;
}
