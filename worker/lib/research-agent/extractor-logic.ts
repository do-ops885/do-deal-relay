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

function generateReferralUrl(source: string, code: string): string {
  const urlPatterns: Record<string, string> = {
    producthunt: `https://www.producthunt.com/products/?ref=${code.toLowerCase()}`,
    reddit: `https://www.reddit.com/r/referrals/?code=${code.toLowerCase()}`,
    hackernews: `https://news.ycombinator.com/item?id=${code.toLowerCase()}`,
    github: `https://github.com/?ref=${code.toLowerCase()}`,
  };
  return (
    urlPatterns[source] || `https://example.com/referral/${code.toLowerCase()}`
  );
}

export function extractReferralsFromContent(
  content: string,
  source: ResearchSource,
  sourceName: string,
): ExtractedReferral[] {
  const now = new Date().toISOString();
  const extracted = extractFromHtml(content, {
    selectors: source.selectors as Record<string, string>,
    regex_patterns: source.extractionPatterns,
  });

  const codes = extracted["code"] || [];
  const rewards = extracted["reward"] || [];
  const urls = extracted["url"] || [];

  return codes.map((code, i) => ({
    code: code.toUpperCase(),
    url: urls[i] || urls[0] || generateReferralUrl(sourceName, code),
    source: sourceName,
    discoveredAt: now,
    rewardSummary: rewards[i] || rewards[0],
    confidence: source.selectors?.code ? 0.9 : 0.6,
  }));
}
