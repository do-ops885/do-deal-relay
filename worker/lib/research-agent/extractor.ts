import { ResearchSource, PageContentResult, MetaTags } from "./types";
import { extractFromHtml } from "../html-utils";

export interface ExtractedReferral {
  code: string;
  url: string;
  source: string;
  discoveredAt: string;
  rewardSummary?: string;
  confidence: number;
}

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
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
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

export function extractReferralsFromContent(
  content: string,
  source: ResearchSource,
  sourceName: string,
): ExtractedReferral[] {
  const now = new Date().toISOString();
  const extracted = extractFromHtml(content, {
    selectors: source.selectors,
    regex_patterns: source.extractionPatterns,
  });

  const codes = extracted["code"] || [];
  const rewards = extracted["reward"] || [];
  const urls = extracted["url"] || [];

  return codes.map((code, i) => ({
    code: code.toUpperCase(),
    url: urls[i] || `https://example.com/referral/${code.toLowerCase()}`,
    source: sourceName,
    discoveredAt: now,
    rewardSummary: rewards[i],
    confidence: source.selectors?.code ? 0.9 : 0.6,
  }));
}
