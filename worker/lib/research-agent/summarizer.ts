import { CONFIG } from "../../config";
import { logger } from "../global-logger";
import { toError } from "../sanitize-error";
import type { ExtractedContent } from "./extractor";
import { runWorkersAI } from "../ai-gateway/workers-ai";

export interface ResearchSummary {
  deal_title: string;
  price: string;
  source: string;
  relevance_score: number;
  summary: string;
  key_points: string[];
}

type AiRunFn = (model: string, inputs: unknown) => Promise<unknown>;

const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const TRUNCATED_CONTENT_LENGTH = 4000;

function truncateContent(
  content: string,
  maxLength: number = TRUNCATED_CONTENT_LENGTH,
): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + "...";
}

function extractKeyPoints(content: string): string[] {
  const points: string[] = [];

  const bulletMatch = content.matchAll(/[•●◦▪►-]\s*([^\n]{10,})/g);
  for (const match of bulletMatch) {
    const point = match[1]?.trim();
    if (point && point.length > 5) {
      points.push(point);
    }
  }

  const numMatch = content.matchAll(/\d+[.)]\s*([^\n]{10,})/g);
  for (const match of numMatch) {
    const point = match[1]?.trim();
    if (point && point.length > 5) {
      points.push(point);
    }
  }

  if (points.length === 0) {
    const sentences = content.match(/[^.!?\n]+[.!?]/g);
    if (sentences) {
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed.length > 10 && trimmed.length < 200) {
          points.push(trimmed);
        }
      }
    }
  }

  return points.slice(0, 5);
}

function extractPrice(content: string): string {
  const pricePatterns = [
    /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,
    /(\d+)\s*(?:USD|EUR|GBP)/gi,
    /(?:free|worth|up to|get|earn|receive)\s+\$?(\d+)/gi,
    /(?:bonus|reward|credit|discount)\s*(?::|of)?\s*\$?(\d+)/gi,
    /(\d+)%\s*(?:off|bonus|discount|reward)/gi,
  ];

  for (const pattern of pricePatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(content);
    if (match) {
      return match[0]?.trim() ?? "";
    }
  }

  return "";
}

function extractDealTitle(content: string): string {
  const titlePatterns = [
    /<h1[^>]*>([^<]+)<\/h1>/i,
    /<title[^>]*>([^<]+)<\/title>/i,
    /<h2[^>]*>([^<]+)<\/h2>/i,
    /class="[^"]*title[^"]*"[^>]*>([^<]+)</i,
    /class="[^"]*heading[^"]*"[^>]*>([^<]+)</i,
  ];

  for (const pattern of titlePatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(content);
    const matched = match?.[1];
    if (matched && matched.trim().length > 3) {
      return matched.trim();
    }
  }

  const firstLine = content.split("\n")[0]?.trim() ?? "";
  return firstLine.length > 3 ? firstLine.substring(0, 200) : "Unknown Deal";
}

function extractSource(content: string, url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function generateSummary(
  dealTitle: string,
  price: string,
  keyPoints: string[],
): string {
  const parts: string[] = [];

  if (dealTitle && dealTitle !== "Unknown Deal") {
    parts.push(dealTitle);
  }

  if (price) {
    parts.push(`Reward: ${price}`);
  }

  if (keyPoints.length > 0) {
    parts.push(keyPoints.slice(0, 3).join(". "));
  }

  return parts.length > 0 ? parts.join(". ") : "No summary available";
}

async function summarizeWithAI(
  env: {
    AI?: Ai;
    AI_GATEWAY_URL?: string;
    AI_GATEWAY_ENABLED?: string;
    AI_GATEWAY_API_KEY?: string;
    AI_GATEWAY_MODEL?: string;
  },
  content: string,
  url: string,
): Promise<ResearchSummary | null> {
  if (!env.AI) return null;

  const truncated = truncateContent(content);
  const source = extractSource(truncated, url);

  const prompt = `You are a deal discovery assistant. Analyze the following web page content from "${source}" and extract deal/referral information.

Content:
${truncated}

Return ONLY valid JSON with these exact fields:
{
  "deal_title": "string - the name/title of the offer or deal",
  "price": "string - the monetary value, discount percentage, or reward amount",
  "relevance_score": "number between 0 and 1 - how relevant this is as a referral deal",
  "summary": "string - a 1-2 sentence summary of the deal",
  "key_points": "array of strings - 3-5 bullet points about the deal"
}`;

  try {
    const result = await runWorkersAI(env, AI_MODEL, {
      prompt,
      max_tokens: CONFIG.NLQ_AI_MAX_TOKENS_LONG,
      temperature: 0.2,
    });

    const response = result as { response: string };
    const cleaned = response.response
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
    const parsed = JSON.parse(cleaned) as ResearchSummary;

    return {
      deal_title: parsed.deal_title || extractDealTitle(content),
      price: parsed.price || extractPrice(content),
      source,
      relevance_score: Math.max(0, Math.min(1, parsed.relevance_score ?? 0.5)),
      summary: parsed.summary || "",
      key_points: Array.isArray(parsed.key_points)
        ? parsed.key_points.slice(0, 5)
        : [],
    };
  } catch (error) {
    const err = toError(error);
    logger.warn(`AI summarization failed, using rule-based: ${err.message}`, {
      component: "summarizer",
      url,
    });
    return null;
  }
}

export async function summarizeContent(
  env: { AI?: Ai },
  content: string,
  url: string,
): Promise<ResearchSummary> {
  const source = extractSource(content, url);

  const aiResult = await summarizeWithAI(env, content, url);
  if (aiResult) return aiResult;

  const dealTitle = extractDealTitle(content);
  const price = extractPrice(content);
  const keyPoints = extractKeyPoints(content);
  const summary = generateSummary(dealTitle, price, keyPoints);
  const relevanceScore = price ? 0.7 : keyPoints.length > 0 ? 0.5 : 0.3;

  return {
    deal_title: dealTitle,
    price,
    source,
    relevance_score: relevanceScore,
    summary,
    key_points: keyPoints,
  };
}

export function summarizeFromExtracted(
  extracted: Record<string, ExtractedContent>,
  url: string,
): ResearchSummary {
  const source = extractSource("", url);

  const dealTitle = extracted.dealTitle?.text?.[0] || extractDealTitle("");
  const price = extracted.price?.text?.[0] || "";
  const description = extracted.description?.text?.join(" ") || "";
  const keyPointTexts = extracted.keyPoints?.text || [];
  const codes =
    extracted.code?.text || extracted.code?.attributes?.["data-ref-code"] || [];

  const keyPoints: string[] = [];
  if (codes.length > 0) {
    keyPoints.push(`Referral code available: ${codes[0]}`);
  }
  if (price) {
    keyPoints.push(`Reward value: ${price}`);
  }
  keyPoints.push(...keyPointTexts.slice(0, 4));

  const summary = [dealTitle, price ? `Reward: ${price}` : "", description]
    .filter(Boolean)
    .join(". ");

  return {
    deal_title: dealTitle || "Unknown Deal",
    price,
    source,
    relevance_score: price ? 0.8 : codes.length > 0 ? 0.7 : 0.4,
    summary: summary || "No summary available",
    key_points: keyPoints.slice(0, 5),
  };
}
