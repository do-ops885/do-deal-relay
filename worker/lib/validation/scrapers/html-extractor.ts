import type { ExtractedReward } from "./types";
import { REWARD_PATTERNS, CURRENCY_PATTERNS } from "./types";

function parseValue(valueStr: string): number {
  const cleaned = valueStr.replace(/,/g, "");
  return parseFloat(cleaned);
}

function detectCurrency(text: string, position: number): string | undefined {
  const context = text.slice(Math.max(0, position - 50), position + 50);

  for (const { pattern, code } of CURRENCY_PATTERNS) {
    if (pattern.test(context)) {
      return code;
    }
  }

  return undefined;
}

function stripScriptAndStyleTags(input: string): string {
  const SCRIPT_BLOCK = /<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi;
  const STYLE_BLOCK = /<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi;
  let result = input;
  let previous: string;
  do {
    previous = result;
    result = result.replace(SCRIPT_BLOCK, "").replace(STYLE_BLOCK, "");
  } while (result !== previous);
  return result;
}

function extractTextFromHtml(html: string): string {
  const sanitized = stripScriptAndStyleTags(html);
  return sanitized
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFromStructuredData(
  html: string,
): Partial<ExtractedReward> | null {
  const jsonLdMatch = html.match(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (jsonLdMatch && jsonLdMatch[1]) {
    try {
      const data = JSON.parse(jsonLdMatch[1]);
      if (data["@type"] === "Offer" && data.price) {
        return {
          type: "cash",
          value: parseFloat(data.price),
          currency: data.priceCurrency,
        };
      }
    } catch {
      // JSON parse failed, continue with other methods
    }
  }

  const metaDescription = html.match(
    /<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i,
  );
  if (metaDescription) {
    const desc = metaDescription[1];
    if (desc) {
      for (const pattern of REWARD_PATTERNS.cash) {
        const match = desc.match(pattern);
        if (match && match[1] !== undefined) {
          return {
            type: "cash",
            value: parseValue(match[1]),
          };
        }
      }
    }
  }

  return null;
}

function findRewardDescription(
  text: string,
  reward: ExtractedReward,
): string | undefined {
  const sentences = text.split(/[.!?]+/);
  const valueStr = String(reward.value);

  for (const sentence of sentences) {
    if (sentence.includes(valueStr)) {
      const trimmed = sentence.trim();
      if (trimmed.length > 10 && trimmed.length < 200) {
        return trimmed;
      }
    }
  }

  return undefined;
}

export function extractRewardFromHTML(html: string): ExtractedReward | null {
  const text = extractTextFromHtml(html);
  const candidates: ExtractedReward[] = [];

  for (const pattern of REWARD_PATTERNS.cash) {
    const match = text.match(pattern);
    if (match && match[1] !== undefined) {
      const value = parseValue(match[1]);
      const currency = detectCurrency(text, match.index || 0);
      candidates.push({
        type: "cash",
        value,
        currency,
        confidence: 0.8,
      });
    }
  }

  for (const pattern of REWARD_PATTERNS.percent) {
    const match = text.match(pattern);
    if (match && match[1] !== undefined) {
      const value = parseFloat(match[1]);
      candidates.push({
        type: "percent",
        value,
        confidence: 0.75,
      });
    }
  }

  for (const pattern of REWARD_PATTERNS.credit) {
    const match = text.match(pattern);
    if (match && match[1] !== undefined) {
      const value = parseValue(match[1]);
      candidates.push({
        type: "credit",
        value,
        confidence: 0.7,
      });
    }
  }

  for (const pattern of REWARD_PATTERNS.item) {
    const match = text.match(pattern);
    if (match && match[1] !== undefined) {
      candidates.push({
        type: "item",
        value: match[1].trim(),
        confidence: 0.6,
      });
    }
  }

  const structuredReward = extractFromStructuredData(html);
  if (structuredReward) {
    candidates.push({
      type: structuredReward.type,
      value: structuredReward.value,
      currency: structuredReward.currency,
      description: structuredReward.description,
      confidence: 0.9,
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  const best = candidates[0];
  if (!best) return null;

  const description = findRewardDescription(text, best);

  return {
    ...best,
    description,
  };
}
