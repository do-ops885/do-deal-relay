import { Deal, SourceConfig } from "../types";
import { generateDealId } from "../lib/crypto";

const DISCOVERY_CONSTANTS = {
  CONTEXT_WINDOW: 500,
  DESCRIPTION_CONTEXT_WINDOW: 300,
  EXPIRY_CONFIDENCE_DATE: 0.8,
  EXPIRY_CONFIDENCE_UNKNOWN: 0.3,
} as const;

interface ExtractedDeal {
  code: string;
  url: string;
  title: string;
  description: string;
  reward_type: string;
  reward_value: string | number;
  reward_currency?: string;
  expiry_date?: string;
}

const contentCache = new Map<string, string>();

export function extractContent(
  content: string,
  code: string,
  window: number = DISCOVERY_CONSTANTS.CONTEXT_WINDOW,
): string {
  const cacheKey = `${code}:${window}`;
  const cached = contentCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const index = content.indexOf(code);
  if (index === -1) {
    contentCache.set(cacheKey, "");
    return "";
  }
  const result = content.slice(Math.max(0, index - window), index + window);
  contentCache.set(cacheKey, result);
  return result;
}

export function extractTitle(content: string, code: string): string {
  const context = extractContent(content, code);
  const titleMatch = context.match(/<title>([^<]+)/i);
  if (titleMatch && titleMatch[1]) return titleMatch[1].trim();

  const h1Match = context.match(/<h1[^>]*>([^<]+)/i);
  if (h1Match && h1Match[1]) return h1Match[1].trim();

  return "Referral Deal";
}

export function extractDescription(content: string, code: string): string {
  const context = extractContent(
    content,
    code,
    DISCOVERY_CONSTANTS.DESCRIPTION_CONTEXT_WINDOW,
  );
  const metaMatch = context.match(
    /<meta[^>]*description[^>]*content="([^"]+)"/i,
  );
  if (metaMatch && metaMatch[1]) return metaMatch[1].trim();

  const pMatch = context.match(/<p[^>]*>([^<]+)/i);
  if (pMatch && pMatch[1]) return pMatch[1].trim();

  return `Use referral code ${code}`;
}

export function parseHTMLContent(
  content: string,
  source: SourceConfig,
): ExtractedDeal[] {
  const deals: ExtractedDeal[] = []; // Code length bounds: 6-20 characters
  const codePattern =
    /(?:referral|invite|promo)[_-]?(?:code)?["']?\s*[:=]\s*["']?([A-Z0-9]{6,20})/gi;
  const urlPattern = /https?:\/\/[^\s"<>]+/gi;
  const rewardPattern =
    /(?:reward|bonus|get|earn)\s+\$?([0-9]+[0-9,]*\.?[0-9]*)\s*(USD|EUR|GBP|%)?/gi;

  let match: RegExpExecArray | null = codePattern.exec(content);
  while (match !== null) {
    const code: string | undefined = match[1];
    if (!code) {
      match = codePattern.exec(content);
      continue;
    }

    const urlMatch = content
      .slice(
        Math.max(0, match.index - DISCOVERY_CONSTANTS.CONTEXT_WINDOW),
        match.index + DISCOVERY_CONSTANTS.CONTEXT_WINDOW,
      )
      .match(urlPattern);

    const rewardMatch = content
      .slice(
        Math.max(0, match.index - DISCOVERY_CONSTANTS.CONTEXT_WINDOW),
        match.index + DISCOVERY_CONSTANTS.CONTEXT_WINDOW,
      )
      .match(rewardPattern);

    deals.push({
      code,
      url:
        urlMatch && urlMatch[0]
          ? urlMatch[0]
          : `https://${source.domain}/invite/${code}`,
      title: extractTitle(content, code),
      description: extractDescription(content, code),
      reward_type:
        rewardMatch && rewardMatch[2]
          ? rewardMatch[2] === "%"
            ? "percent"
            : "cash"
          : "credit",
      reward_value:
        rewardMatch && rewardMatch[1]
          ? parseFloat(rewardMatch[1].replace(",", ""))
          : 0,
      reward_currency:
        rewardMatch?.[2] && rewardMatch[2] !== "%" ? rewardMatch[2] : undefined,
    });

    match = codePattern.exec(content);
  }

  const seen = new Set<string>();
  return deals.filter((d) => {
    if (seen.has(d.code)) return false;
    seen.add(d.code);
    return true;
  });
}

export function parseJSONContent(
  content: string,
  source: SourceConfig,
): ExtractedDeal[] {
  try {
    const data = JSON.parse(content);
    const deals: ExtractedDeal[] = [];

    const items = Array.isArray(data)
      ? data
      : data.deals || data.items || [data];

    for (const item of items) {
      if (item.code || item.referral_code || item.invite_code) {
        deals.push({
          code: item.code || item.referral_code || item.invite_code,
          url:
            item.url ||
            item.link ||
            `https://${source.domain}/invite/${item.code}`,
          title: item.title || item.name || `${source.domain} Referral`,
          description: item.description || `Referral code for ${source.domain}`,
          reward_type: item.reward_type || (item.percent ? "percent" : "cash"),
          reward_value: item.reward_value || item.amount || item.bonus || 0,
          reward_currency: item.currency || item.reward_currency,
          expiry_date: item.expiry || item.expires_at,
        });
      }
    }

    return deals;
  } catch {
    return [];
  }
}

export async function buildDeal(
  extracted: ExtractedDeal,
  source: SourceConfig,
): Promise<Deal> {
  const domain = source.domain;
  const now = new Date().toISOString();

  const id = await generateDealId(
    domain,
    extracted.code,
    extracted.reward_type,
  );

  return {
    id,
    source: {
      url: extracted.url,
      domain,
      discovered_at: now,
      trust_score: source.trust_initial,
    },
    title: extracted.title,
    description: extracted.description,
    code: extracted.code,
    url: extracted.url,
    reward: {
      type: extracted.reward_type as "cash" | "credit" | "percent" | "item",
      value: extracted.reward_value,
      currency: extracted.reward_currency,
    },
    expiry: {
      date: extracted.expiry_date,
      confidence: extracted.expiry_date
        ? DISCOVERY_CONSTANTS.EXPIRY_CONFIDENCE_DATE
        : DISCOVERY_CONSTANTS.EXPIRY_CONFIDENCE_UNKNOWN,
      type: extracted.expiry_date ? "hard" : "unknown",
    },
    metadata: {
      category: ["referral", "signup"],
      tags: [domain, extracted.reward_type],
      normalized_at: now,
      confidence_score: source.trust_initial,
      status: "active",
    },
  };
}
