import { ResearchSource, PageContentResult, MetaTags } from "./types";
import { extractBySelectors } from "../html-utils";

export interface ExtractedReferral {
  code: string;
  url: string;
  source: string;
  discoveredAt: string;
  rewardSummary?: string;
  confidence: number;
  context?: string;
}

/**
 * Simple HTML parser to extract content
 */
export function parseHtmlContent(url: string, html: string): PageContentResult {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1] ? titleMatch[1].trim() : "";

  // Extract meta description
  const metaDescMatch = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i,
  );
  const description = metaDescMatch?.[1] ? metaDescMatch[1].trim() : "";

  // Extract all meta tags
  const metaTags: MetaTags = {};
  const metaRegex = /<meta[^>]*>/gi;
  for (const metaMatch of html.matchAll(metaRegex)) {
    const tag = metaMatch[0];
    if (tag) {
      const nameMatch = tag.match(/name=["']([^"']*)["']/i);
      const contentMatch = tag.match(/content=["']([^"']*)["']/i);
      if (nameMatch?.[1] && contentMatch?.[1]) {
        metaTags[nameMatch[1]] = contentMatch[1];
      }
    }
  }

  // Remove script and style tags for text extraction
  let textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Truncate text content
  textContent = textContent.substring(0, 10000);

  // Extract links
  const links: Array<{ text: string; href: string }> = [];
  const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi;
  for (const linkMatch of html.matchAll(linkRegex)) {
    const href = linkMatch[1];
    const text = linkMatch[2]?.trim() ?? "";
    if (href && !href.startsWith("javascript:") && !href.startsWith("#")) {
      // Convert relative URLs to absolute
      const absoluteUrl = href.startsWith("http")
        ? href
        : new URL(href, url).toString();
      links.push({ text, href: absoluteUrl });
    }
  }

  return {
    url,
    title,
    description,
    textContent,
    links: links.slice(0, 100), // Limit links
    metaTags,
  };
}

/**
 * Extract referrals from content using source patterns
 */
export function extractReferralsFromContent(
  content: string,
  source: ResearchSource,
  sourceName: string,
): ExtractedReferral[] {
  const referrals: ExtractedReferral[] = [];
  const now = new Date().toISOString();

  // 1. Try CSS selectors if defined
  if (source.selectors) {
    const extracted = extractBySelectors(content, source.selectors);
    if (extracted["code"] && extracted["code"].length > 0) {
      for (let i = 0; i < extracted["code"].length; i++) {
        const code = extracted["code"][i];
        if (!code) continue;

        const reward = extracted["reward"]?.[i] || extracted["reward"]?.[0];
        const url =
          extracted["url"]?.[i] ||
          extracted["url"]?.[0] ||
          generateReferralUrl(sourceName, code);

        referrals.push({
          code: code.toUpperCase(),
          url,
          source: sourceName,
          discoveredAt: now,
          rewardSummary: reward,
          confidence: 0.9, // High confidence for selector matches
          context: `Extracted via CSS selector: ${source.selectors["code"]}`,
        });
      }
      if (referrals.length > 0) return referrals;
    }
  }

  // 2. Fallback to regex extraction
  const codeMatches = extractWithContext(
    content,
    source.extractionPatterns.code,
  );

  for (const match of codeMatches) {
    const code = match.match;
    const context = match.context;

    // Look for reward in the same context
    const rewardMatch = findFirstMatch(
      context,
      source.extractionPatterns.reward,
    );

    // Look for URL
    const urlMatch = findFirstMatch(context, source.extractionPatterns.url);
    const url = urlMatch || generateReferralUrl(sourceName, code);

    // Calculate confidence based on context quality
    const confidence = calculateConfidence(code, context, rewardMatch);

    if (confidence >= 0.3) {
      // Minimum confidence threshold
      referrals.push({
        code: code.toUpperCase(),
        url,
        source: sourceName,
        discoveredAt: now,
        rewardSummary: rewardMatch || undefined,
        confidence,
        context: context.slice(0, 200), // Store truncated context
      });
    }
  }

  return referrals;
}

/**
 * Extract matches with surrounding context
 */
export function extractWithContext(
  content: string,
  patterns: RegExp[],
): Array<{ match: string; context: string }> {
  const matches: Array<{ match: string; context: string }> = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    // Reset regex state
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(content)) !== null) {
      const matchedText = match[1] ?? match[0]; // Use capture group 1 if exists
      if (!matchedText) continue;
      const key = matchedText.toLowerCase();

      if (seen.has(key)) continue;
      seen.add(key);

      // Extract context around match (200 chars before and after)
      const start = Math.max(0, match.index - 200);
      const end = Math.min(
        content.length,
        match.index + matchedText.length + 200,
      );
      const context = content.slice(start, end);

      matches.push({ match: matchedText, context });
    }
  }

  return matches;
}

/**
 * Find first matching pattern in text
 */
export function findFirstMatch(
  text: string,
  patterns: RegExp[],
): string | null {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      return match[1] ?? match[0] ?? null;
    }
  }
  return null;
}

/**
 * Generate a referral URL based on source and code
 */
export function generateReferralUrl(source: string, code: string): string {
  const urlPatterns: { [key: string]: string } = {
    producthunt: `https://www.producthunt.com/products/?ref=${code.toLowerCase()}`,
    reddit: `https://www.reddit.com/r/referrals/?code=${code.toLowerCase()}`,
    hackernews: `https://news.ycombinator.com/item?id=${code.toLowerCase()}`,
    github: `https://github.com/?ref=${code.toLowerCase()}`,
    company_site: `https://example.com/invite/${code.toLowerCase()}`,
  };

  return (
    urlPatterns[source] || `https://example.com/referral/${code.toLowerCase()}`
  );
}

/**
 * Calculate confidence score based on code quality and context
 */
export function calculateConfidence(
  code: string,
  context: string,
  rewardMatch: string | null,
): number {
  let confidence = 0.5;

  // Code quality factors
  if (code.length >= 6 && code.length <= 20) {
    confidence += 0.1; // Reasonable length
  }

  if (/^[A-Z0-9_-]+$/.test(code)) {
    confidence += 0.1; // Valid format
  }

  if (/\d/.test(code) && /[A-Z]/.test(code)) {
    confidence += 0.1; // Mixed alphanumeric
  }

  // Context quality factors
  const contextLower = context.toLowerCase();

  if (rewardMatch) {
    confidence += 0.1; // Has reward info
  }

  if (/\b(?:refer|referral|invite|code|promo|bonus)\b/.test(contextLower)) {
    confidence += 0.1; // Referral-related context
  }

  // Penalize suspicious patterns
  if (/\b(?:test|example|demo|sample|fake)\b/.test(contextLower)) {
    confidence -= 0.2;
  }

  if (code.length < 4) {
    confidence -= 0.2; // Too short
  }

  return Math.max(0.1, Math.min(0.95, confidence));
}
