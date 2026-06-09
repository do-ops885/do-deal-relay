import * as cheerio from "cheerio";
import type { ResearchSource } from "./types";
import type { ExtractedReferral } from "./fetcher";

export function extractReferralsFromContent(
  content: string,
  source: ResearchSource,
  sourceName: string,
): ExtractedReferral[] {
  const referrals: ExtractedReferral[] = [];
  const now = new Date().toISOString();

  if (source.selectors && content.includes("<")) {
    try {
      const $ = cheerio.load(content);
      const {
        container,
        code: codeSelector,
        reward: rewardSelector,
        url: urlSelector,
      } = source.selectors;

      $(container).each((_, el) => {
        const code = $(el).find(codeSelector).text().trim();
        if (code && code.length >= 4) {
          const reward = rewardSelector
            ? $(el).find(rewardSelector).text().trim()
            : undefined;
          let url = urlSelector
            ? $(el).find(urlSelector).attr("href")
            : undefined;

          if (url && !url.startsWith("http")) {
            try {
              url = new URL(url, source.baseUrl).toString();
            } catch {
              // Ignore invalid URLs
            }
          }

          if (!url) {
            url = generateReferralUrl(sourceName, code);
          }

          referrals.push({
            code: code.toUpperCase(),
            url,
            source: `${sourceName}_selector`,
            discoveredAt: now,
            rewardSummary: reward,
            confidence: 0.85,
            context: $(el).text().trim().substring(0, 200),
          });
        }
      });

      if (referrals.length > 0) {
        return referrals;
      }
    } catch (error) {
      console.error(`Selector extraction failed for ${sourceName}:`, error);
    }
  }

  const codeMatches = extractWithContext(
    content,
    source.extractionPatterns.code,
  );

  for (const match of codeMatches) {
    const code = match.match;
    const context = match.context;

    const rewardMatch = findFirstMatch(
      context,
      source.extractionPatterns.reward,
    );

    const urlMatch = findFirstMatch(context, source.extractionPatterns.url);
    const url = urlMatch || generateReferralUrl(sourceName, code);

    const confidence = calculateConfidence(code, context, rewardMatch);

    if (confidence >= 0.3) {
      referrals.push({
        code: code.toUpperCase(),
        url,
        source: sourceName,
        discoveredAt: now,
        rewardSummary: rewardMatch || undefined,
        confidence,
        context: context.slice(0, 200),
      });
    }
  }

  return referrals;
}

function extractWithContext(
  content: string,
  patterns: RegExp[],
): Array<{ match: string; context: string }> {
  const matches: Array<{ match: string; context: string }> = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null = pattern.exec(content);
    while (match !== null) {
      const matchedText = match[1] ?? match[0];
      if (!matchedText) continue;
      const key = matchedText.toLowerCase();

      if (seen.has(key)) continue;
      seen.add(key);

      const start = Math.max(0, match.index - 200);
      const end = Math.min(
        content.length,
        match.index + matchedText.length + 200,
      );
      const context = content.slice(start, end);

      matches.push({ match: matchedText, context });
      match = pattern.exec(content);
    }
  }

  return matches;
}

function findFirstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      return match[1] ?? match[0] ?? null;
    }
  }
  return null;
}

function generateReferralUrl(source: string, code: string): string {
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

function calculateConfidence(
  code: string,
  context: string,
  rewardMatch: string | null,
): number {
  let confidence = 0.5;

  if (code.length >= 6 && code.length <= 20) {
    confidence += 0.1;
  }

  if (/^[A-Z0-9_-]+$/.test(code)) {
    confidence += 0.1;
  }

  if (/\d/.test(code) && /[A-Z]/.test(code)) {
    confidence += 0.1;
  }

  const contextLower = context.toLowerCase();

  if (rewardMatch) {
    confidence += 0.1;
  }

  if (/\b(?:refer|referral|invite|code|promo|bonus)\b/.test(contextLower)) {
    confidence += 0.1;
  }

  if (/\b(?:test|example|demo|sample|fake)\b/.test(contextLower)) {
    confidence -= 0.2;
  }

  if (code.length < 4) {
    confidence -= 0.2;
  }

  return Math.max(0.1, Math.min(0.95, confidence));
}
