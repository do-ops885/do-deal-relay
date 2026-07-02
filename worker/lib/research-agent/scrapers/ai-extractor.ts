// AI-Powered Referral Extractor
// ============================================================================
//
// Uses Cloudflare Workers AI (env.AI) to perform LLM-based extraction of
// referral codes from raw text — useful when regex/selector extraction is
// insufficient or the content is non-standard (e.g., blog posts, reviews).
//
// Model: @cf/meta/llama-3.1-8b-instruct (fast, widely-supported at CF).
// Falls back gracefully if env.AI is unavailable (returns empty array so
// the rest of the pipeline continues).

import { logger } from "../../global-logger";
import {
  buildFetchError,
  buildFetchSuccess,
  type Ai,
  type Scraper,
  type ScraperEnv,
  type SourceName,
} from "./base";

const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const EXTRACTION_PROMPT = `You are a precise referral-code extractor. Given the user-provided text, extract a JSON array of objects with this exact shape:
[{"code": "ABC123", "url": "https://example.com/invite/ABC123", "reward": "Short reward summary", "confidence": 0.85}]

Rules:
- Only return verified-looking codes (4+ chars, mostly A-Z/0-9).
- Set confidence to 0.0-1.0 based on context strength.
- Skip examples like "ABCDEF", "123456", or anything in "test/demo/sample" context.
- Output ONLY valid JSON, no prose, no markdown fences.`;

interface AIExtractedItem {
  code?: string;
  url?: string;
  reward?: string;
  confidence?: number;
}

export interface AIExtractOptions {
  /** Optional domain hint to bias extraction (e.g., "trading212.com"). */
  domain?: string;
  /** Truncate input text to this many chars to stay within model limits. */
  maxTextChars?: number;
}

export class AIExtractorScraper implements Scraper {
  readonly name: SourceName = "ai_extractor";

  isReady(env: ScraperEnv): boolean {
    return Boolean(env.AI);
  }

  async scrape(
    env: ScraperEnv,
    rawText: string,
    _limit?: number,
  ): Promise<FetchResultType> {
    const startTime = Date.now();

    if (!env.AI) {
      return buildFetchError(503, "Workers AI binding (env.AI) unavailable", startTime);
    }

    const truncated = rawText.slice(0, this.options.maxTextChars ?? 8000);
    if (!truncated.trim()) {
      return buildFetchSuccess('[]', "application/json", startTime);
    }

    try {
      const aiResponse = await env.AI.run(AI_MODEL, {
        messages: [
          { role: "system", content: EXTRACTION_PROMPT },
          {
            role: "user",
            content: this.buildUserContent(truncated, this.options.domain),
          },
        ],
        temperature: 0.0,
        max_tokens: 512,
      });

      const text = this.coerceAIResponseToText(aiResponse);
      const items = this.parseExtractionResponse(text);
      return buildFetchSuccess(
        JSON.stringify(items),
        "application/json",
        startTime,
      );
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      logger.error("AI extractor failed", {
        component: "ai-extractor",
        error: err,
      });
      return buildFetchError(500, `AI extractor error: ${err}`, startTime);
    }
  }

  /** Allowed options set on instance construction. Encapsulated to keep call sites tidy. */
  private options: AIExtractOptions;
  constructor(options: AIExtractOptions = {}) {
    this.options = options;
  }

  private buildUserContent(text: string, domain?: string): string {
    const prefix = domain ? `Domain: ${domain}\n` : "";
    return `${prefix}Text:\n"""${text}"""`;
  }

  private coerceAIResponseToText(raw: unknown): string {
    if (typeof raw === "string") return raw;
    if (raw && typeof raw === "object") {
      const r = raw as { response?: unknown };
      if (typeof r.response === "string") return r.response;
      const r2 = raw as { output_text?: unknown };
      if (typeof r2.output_text === "string") return r2.output_text;
    }
    return "";
  }

  private parseExtractionResponse(text: string): AIExtractedItem[] {
    const sanitized = text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    try {
      const parsed = JSON.parse(sanitized);
      if (Array.isArray(parsed)) return parsed as AIExtractedItem[];
    } catch {
      // Fall through to regex extraction below
    }

    const arrayMatch = sanitized.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]);
        if (Array.isArray(parsed)) return parsed as AIExtractedItem[];
      } catch {
        // give up
      }
    }
    return [];
  }
}

// Alias used in the FetchResult return type above to avoid a circular import
// with the types module (FetchResult lives in research-agent/types).
// eslint-disable-next-line @typescript-eslint/no-empty-interface
type FetchResultType = Awaited<ReturnType<Scraper["scrape"]>>;

// Convenience factory for orchestrator code that doesn't need fine control.
export function createAIExtractor(
  domain?: string,
  maxTextChars?: number,
): AIExtractorScraper {
  return new AIExtractorScraper({ domain, maxTextChars });
}
